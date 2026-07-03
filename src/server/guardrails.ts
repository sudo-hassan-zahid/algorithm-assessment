import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { actionEvents, orders, refunds, supportRequests } from "@/db/schema";
import { assertCancellationAllowed, assertRefundAllowed } from "@/domain/policy";
import { AppError } from "@/lib/errors";

type ActionActor = { type: "AGENT" | "REVIEWER"; id?: string };
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function inspectOwnedOrder(requestId: string, orderId: string) {
  const [order] = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      version: orders.version,
    })
    .from(orders)
    .innerJoin(supportRequests, eq(supportRequests.customerId, orders.customerId))
    .where(and(eq(supportRequests.id, requestId), eq(orders.id, orderId)))
    .limit(1);

  return order ?? null;
}

export async function executeRefund(
  requestId: string,
  orderId: string,
  amount: string,
  actor: ActionActor,
) {
  return db.transaction((tx) => executeRefundInTransaction(tx, requestId, orderId, amount, actor));
}

export async function executeRefundInTransaction(
  tx: DbTransaction,
  requestId: string,
  orderId: string,
  amount: string,
  actor: ActionActor,
) {
    const lockedOrder = await tx.execute<{
      id: string;
      customer_id: string;
      status: string;
      total_amount: string;
      currency: string;
    }>(sql`
      SELECT o.id, o.customer_id, o.status, o.total_amount, o.currency
      FROM orders o
      JOIN support_requests sr ON sr.customer_id = o.customer_id
      WHERE o.id = ${orderId} AND sr.id = ${requestId}
      FOR UPDATE OF o
    `);
    const order = lockedOrder.rows[0];

    if (!order) throw new AppError("ORDER_NOT_OWNED", "Order was not found for this customer", 403);
    assertRefundAllowed(order.status, order.total_amount, amount);

    const existing = await tx
      .select({ id: refunds.id })
      .from(refunds)
      .where(eq(refunds.orderId, orderId))
      .limit(1);
    if (existing.length) throw new AppError("ALREADY_REFUNDED", "This order has already been refunded", 409);

    try {
      const [refund] = await tx
        .insert(refunds)
        .values({ requestId, orderId, amount, currency: order.currency })
        .returning();

      await tx.insert(actionEvents).values({
        requestId,
        actorType: actor.type,
        actorId: actor.id,
        eventType: "REFUND_EXECUTED",
        details: { refundId: refund.id, orderId, amount, currency: order.currency },
      });
      return refund;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError("ALREADY_REFUNDED", "This order has already been refunded", 409);
      }
      throw error;
    }
}

export async function executeCancellation(requestId: string, orderId: string, actor: ActionActor) {
  return db.transaction((tx) => executeCancellationInTransaction(tx, requestId, orderId, actor));
}

export async function executeCancellationInTransaction(
  tx: DbTransaction,
  requestId: string,
  orderId: string,
  actor: ActionActor,
) {
    const lockedOrder = await tx.execute<{
      id: string;
      status: string;
      version: number;
    }>(sql`
      SELECT o.id, o.status, o.version
      FROM orders o
      JOIN support_requests sr ON sr.customer_id = o.customer_id
      WHERE o.id = ${orderId} AND sr.id = ${requestId}
      FOR UPDATE OF o
    `);
    const order = lockedOrder.rows[0];

    if (!order) throw new AppError("ORDER_NOT_OWNED", "Order was not found for this customer", 403);
    assertCancellationAllowed(order.status);

    const [cancelled] = await tx
      .update(orders)
      .set({ status: "CANCELLED", version: order.version + 1, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.version, order.version)))
      .returning();
    if (!cancelled) throw new AppError("CONCURRENT_ORDER_UPDATE", "Order changed while cancellation was being processed", 409);

    await tx.insert(actionEvents).values({
      requestId,
      actorType: actor.type,
      actorId: actor.id,
      eventType: "ORDER_CANCELLED",
      details: { orderId },
    });
    return cancelled;
}
