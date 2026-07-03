import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionEvents, escalations, supportRequests } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  executeCancellationInTransaction,
  executeRefundInTransaction,
  inspectOwnedOrder,
} from "./guardrails";

type EscalationInput = {
  requestId: string;
  orderId?: string | null;
  action: "REFUND" | "CANCEL" | "REPLACEMENT" | "OTHER";
  proposedAmount?: string | null;
  reason: string;
};

export async function createEscalation(input: EscalationInput) {
  if (input.orderId) {
    const order = await inspectOwnedOrder(input.requestId, input.orderId);
    if (!order) input = { ...input, orderId: null, proposedAmount: null };
  }

  return db.transaction(async (tx) => {
    const lockedRequest = await tx.execute<{ status: string }>(
      sql`SELECT status FROM support_requests WHERE id = ${input.requestId} FOR UPDATE`,
    );
    const [existing] = await tx
      .select()
      .from(escalations)
      .where(eq(escalations.requestId, input.requestId))
      .limit(1);
    if (existing) return existing;
    if (lockedRequest.rows[0]?.status !== "PROCESSING") {
      throw new AppError(
        "REQUEST_ALREADY_FINALIZED",
        "This request has already reached a final state",
        409,
      );
    }

    const [escalation] = await tx.insert(escalations).values(input).returning();
    await tx
      .update(supportRequests)
      .set({
        status: "ESCALATED",
        decision: input.action,
        decisionReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(supportRequests.id, input.requestId));
    await tx.insert(actionEvents).values({
      requestId: input.requestId,
      actorType: "AGENT",
      eventType: "ESCALATED",
      details: {
        escalationId: escalation.id,
        action: input.action,
        reason: input.reason,
      },
    });
    return escalation;
  });
}

export async function reviewEscalation(
  escalationId: string,
  decision: "APPROVE" | "REJECT",
  reviewer: string,
) {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{
      id: string;
      request_id: string;
      order_id: string | null;
      action: "REFUND" | "CANCEL" | "REPLACEMENT" | "OTHER";
      proposed_amount: string | null;
      status: "PENDING" | "APPROVED" | "REJECTED";
    }>(sql`SELECT * FROM escalations WHERE id = ${escalationId} FOR UPDATE`);
    const escalation = locked.rows[0];
    if (!escalation)
      throw new AppError("ESCALATION_NOT_FOUND", "Escalation not found", 404);
    if (escalation.status !== "PENDING") {
      throw new AppError(
        "ALREADY_REVIEWED",
        `This escalation is already ${escalation.status.toLowerCase()}`,
        409,
        {
          status: escalation.status,
        },
      );
    }

    if (decision === "REJECT") {
      await tx
        .update(escalations)
        .set({
          status: "REJECTED",
          reviewedBy: reviewer,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(escalations.id, escalationId),
            eq(escalations.status, "PENDING"),
          ),
        );
      await tx
        .update(supportRequests)
        .set({ status: "REJECTED", updatedAt: new Date() })
        .where(eq(supportRequests.id, escalation.request_id));
      await tx.insert(actionEvents).values({
        requestId: escalation.request_id,
        actorType: "REVIEWER",
        actorId: reviewer,
        eventType: "ESCALATION_REJECTED",
        details: { escalationId },
      });
      return { status: "REJECTED" as const };
    }

    if (!escalation.order_id) {
      throw new AppError(
        "ORDER_REQUIRED",
        "This action has no verified order and cannot be approved",
        422,
      );
    }
    if (escalation.action === "REFUND") {
      if (!escalation.proposed_amount)
        throw new AppError("AMOUNT_REQUIRED", "Refund amount is required", 422);
      await executeRefundInTransaction(
        tx,
        escalation.request_id,
        escalation.order_id,
        escalation.proposed_amount,
        { type: "REVIEWER", id: reviewer },
      );
    } else if (escalation.action === "CANCEL") {
      await executeCancellationInTransaction(
        tx,
        escalation.request_id,
        escalation.order_id,
        {
          type: "REVIEWER",
          id: reviewer,
        },
      );
    } else {
      throw new AppError(
        "UNSUPPORTED_ACTION",
        "This action cannot be executed by the current system",
        422,
      );
    }

    const updated = await tx
      .update(escalations)
      .set({
        status: "APPROVED",
        reviewedBy: reviewer,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(escalations.id, escalationId),
          eq(escalations.status, "PENDING"),
        ),
      )
      .returning();
    if (!updated.length)
      throw new AppError(
        "ALREADY_REVIEWED",
        "Escalation was reviewed concurrently",
        409,
      );
    await tx
      .update(supportRequests)
      .set({ status: "APPROVED", updatedAt: new Date() })
      .where(eq(supportRequests.id, escalation.request_id));
    await tx.insert(actionEvents).values({
      requestId: escalation.request_id,
      actorType: "REVIEWER",
      actorId: reviewer,
      eventType: "ESCALATION_APPROVED",
      details: { escalationId, action: escalation.action },
    });
    return { status: "APPROVED" as const };
  });
}
