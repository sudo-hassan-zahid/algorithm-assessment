/*
 * Drives the model tool loop for one support request and persists agent runs plus tool-call traces.
 */
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";
import type { ResponseInput } from "openai/resources/responses/responses";

import { db } from "@/db";
import { agentRuns, customers, supportRequests, toolCalls } from "@/db/schema";
import { errorMessage } from "@/lib/errors";
import { createEscalation } from "@/server/escalations";
import { agentTools, executeAgentTool } from "./tools";

const MAX_TOOL_ROUNDS = 8;

const instructions = `You are a support operations agent for an ecommerce store.
Use tools to inspect order data and choose the safest action. Never invent order data.
Refunds always require request_refund and human approval. Never claim a refund was issued.
Use cancel_order only for an order confirmed to belong to the customer; code will enforce shipment rules.
Escalate unknown orders, ownership failures, tool errors, damaged-item replacements, ambiguity, and anything unsafe.
Give concise operational reasons based on verified facts. Finish with a brief outcome summary after a tool finalizes the request.`;

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function processSupportRequest(requestId: string) {
  const [claimed] = await db
    .update(supportRequests)
    .set({ status: "PROCESSING", updatedAt: new Date() })
    .where(
      and(
        eq(supportRequests.id, requestId),
        eq(supportRequests.status, "PENDING"),
      ),
    )
    .returning();

  if (!claimed || claimed.status !== "PROCESSING") return claimed ?? null;

  const [context] = await db
    .select({ message: supportRequests.message, customerName: customers.name })
    .from(supportRequests)
    .innerJoin(customers, eq(customers.id, supportRequests.customerId))
    .where(eq(supportRequests.id, requestId))
    .limit(1);

  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";
  const [run] = await db
    .insert(agentRuns)
    .values({ requestId, model })
    .returning();

  try {
    if (!process.env.GROQ_API_KEY)
      throw new Error("GROQ_API_KEY is not configured");

    const groq = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });
    const input: ResponseInput = [
      {
        role: "user",
        content: `Customer: ${context.customerName}\nRequest: ${context.message}`,
      },
    ];
    let finalOutcome = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await groq.responses.create({
        model,
        instructions,
        input,
        tools: agentTools,
      });
      input.push(...(response.output as unknown as ResponseInput));
      finalOutcome = response.output_text || finalOutcome;

      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );
      if (!calls.length) break;

      for (const call of calls) {
        const result = await executeAgentTool(
          requestId,
          call.name,
          call.arguments,
        );
        await db.insert(toolCalls).values({
          agentRunId: run.id,
          providerCallId: call.call_id,
          name: call.name,
          arguments: parseToolArguments(call.arguments),
          result,
          status: result.ok ? "SUCCEEDED" : "FAILED",
        });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }
    }

    const [current] = await db
      .select({ status: supportRequests.status })
      .from(supportRequests)
      .where(eq(supportRequests.id, requestId))
      .limit(1);
    if (current.status === "PROCESSING") {
      await createEscalation({
        requestId,
        action: "OTHER",
        reason:
          "The agent did not reach a safely executable decision within its tool budget.",
      });
    }

    await db
      .update(agentRuns)
      .set({ status: "COMPLETED", finalOutcome, finishedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
  } catch (error) {
    const message = errorMessage(error);
    const [current] = await db
      .select({ status: supportRequests.status })
      .from(supportRequests)
      .where(eq(supportRequests.id, requestId))
      .limit(1);
    if (current?.status === "PROCESSING") {
      await createEscalation({
        requestId,
        action: "OTHER",
        reason:
          "Automated processing failed; a human must review this request.",
      });
    }
    await db
      .update(agentRuns)
      .set({ status: "FAILED", error: message, finishedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
  }

  const [result] = await db
    .select()
    .from(supportRequests)
    .where(eq(supportRequests.id, requestId))
    .limit(1);
  return result;
}
