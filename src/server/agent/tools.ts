import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { refunds, supportRequests } from "@/db/schema";
import { errorMessage } from "@/lib/errors";
import { createEscalation } from "@/server/escalations";
import { executeCancellation, inspectOwnedOrder } from "@/server/guardrails";

const getOrderSchema = z.object({ order_id: z.string().min(1) });
const refundSchema = z.object({
  order_id: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(3).max(500),
});
const cancellationSchema = z.object({
  order_id: z.string().min(1),
  reason: z.string().min(3).max(500),
});
const escalationSchema = z.object({
  order_id: z.string().min(1).nullable(),
  action: z.enum(["REFUND", "CANCEL", "REPLACEMENT", "OTHER"]),
  proposed_amount: z.number().positive().nullable(),
  reason: z.string().min(3).max(500),
});

export const agentTools = [
  {
    type: "function" as const,
    name: "get_order",
    description:
      "Retrieve an order only when it belongs to the customer who made this request.",
    strict: true,
    parameters: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "request_refund",
    description:
      "Validate and send a refund proposal to mandatory human review. This never issues a refund.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        amount: { type: "number" },
        reason: { type: "string" },
      },
      required: ["order_id", "amount", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "cancel_order",
    description:
      "Cancel a verified order automatically only if it is still in PROCESSING state.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["order_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "escalate_request",
    description:
      "Escalate ambiguity, unsafe operations, unsupported actions, or cases requiring judgment.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        order_id: { type: ["string", "null"] },
        action: {
          type: "string",
          enum: ["REFUND", "CANCEL", "REPLACEMENT", "OTHER"],
        },
        proposed_amount: { type: ["number", "null"] },
        reason: { type: "string" },
      },
      required: ["order_id", "action", "proposed_amount", "reason"],
      additionalProperties: false,
    },
  },
];

export async function executeAgentTool(
  requestId: string,
  name: string,
  rawArguments: string,
) {
  try {
    const args: unknown = JSON.parse(rawArguments);

    if (name !== "get_order") {
      const [request] = await db
        .select({ status: supportRequests.status })
        .from(supportRequests)
        .where(eq(supportRequests.id, requestId))
        .limit(1);
      if (!request || request.status !== "PROCESSING") {
        return {
          ok: false,
          code: "REQUEST_ALREADY_FINALIZED",
          status: request?.status ?? "NOT_FOUND",
        };
      }
    }

    if (name === "get_order") {
      const { order_id } = getOrderSchema.parse(args);
      const order = await inspectOwnedOrder(requestId, order_id);
      return order
        ? { ok: true, order }
        : { ok: false, code: "ORDER_NOT_FOUND_OR_NOT_OWNED" };
    }

    if (name === "request_refund") {
      const { order_id, amount, reason } = refundSchema.parse(args);
      const order = await inspectOwnedOrder(requestId, order_id);
      if (!order) return { ok: false, code: "ORDER_NOT_FOUND_OR_NOT_OWNED" };
      if (amount > Number(order.totalAmount))
        return { ok: false, code: "AMOUNT_EXCEEDS_PAYMENT" };
      const [existingRefund] = await db
        .select({ id: refunds.id })
        .from(refunds)
        .where(eq(refunds.orderId, order_id))
        .limit(1);
      if (existingRefund) return { ok: false, code: "ALREADY_REFUNDED" };

      const escalation = await createEscalation({
        requestId,
        orderId: order_id,
        action: "REFUND",
        proposedAmount: amount.toFixed(2),
        reason,
      });
      return { ok: true, outcome: "ESCALATED", escalationId: escalation.id };
    }

    if (name === "cancel_order") {
      const { order_id, reason } = cancellationSchema.parse(args);
      await executeCancellation(requestId, order_id, { type: "AGENT" });
      await db
        .update(supportRequests)
        .set({
          status: "AUTO_EXECUTED",
          decision: "CANCEL",
          decisionReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(supportRequests.id, requestId),
            eq(supportRequests.status, "PROCESSING"),
          ),
        );
      return { ok: true, outcome: "AUTO_EXECUTED" };
    }

    if (name === "escalate_request") {
      const parsed = escalationSchema.parse(args);
      const escalation = await createEscalation({
        requestId,
        orderId: parsed.order_id,
        action: parsed.action,
        proposedAmount: parsed.proposed_amount?.toFixed(2),
        reason: parsed.reason,
      });
      return { ok: true, outcome: "ESCALATED", escalationId: escalation.id };
    }

    return { ok: false, code: "UNKNOWN_TOOL" };
  } catch (error) {
    return { ok: false, code: "TOOL_REJECTED", message: errorMessage(error) };
  }
}
