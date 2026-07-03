import "dotenv/config";
import { randomUUID } from "node:crypto";
import { count, eq, inArray } from "drizzle-orm";

import { db, pool } from "../src/db";
import { actionEvents, customers, escalations, orders, refunds, supportRequests } from "../src/db/schema";
import { reviewEscalation } from "../src/server/escalations";
import { executeRefund } from "../src/server/guardrails";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const suffix = randomUUID().slice(0, 8);
  const customerId = randomUUID();
  const refundOrderId = `concurrency-refund-${suffix}`;
  const cancelOrderId = `concurrency-cancel-${suffix}`;
  const refundRequestIds = [randomUUID(), randomUUID()];
  const approvalRequestId = randomUUID();
  const escalationId = randomUUID();
  const requestIds = [...refundRequestIds, approvalRequestId];

  try {
  await db.insert(customers).values({ id: customerId, name: "Concurrency Probe", email: `probe-${suffix}@example.com` });
  await db.insert(orders).values([
    { id: refundOrderId, customerId, status: "DELIVERED", totalAmount: "100.00" },
    { id: cancelOrderId, customerId, status: "PROCESSING", totalAmount: "50.00" },
  ]);
  await db.insert(supportRequests).values([
    ...refundRequestIds.map((id) => ({ id, customerId, message: `Refund ${refundOrderId}`, status: "PROCESSING" as const })),
    { id: approvalRequestId, customerId, message: `Cancel ${cancelOrderId}`, status: "ESCALATED" as const },
  ]);
  await db.insert(escalations).values({
    id: escalationId,
    requestId: approvalRequestId,
    orderId: cancelOrderId,
    action: "CANCEL",
    reason: "Concurrency verification",
  });

  const refundAttempts = await Promise.allSettled(
    refundRequestIds.map((requestId) => executeRefund(requestId, refundOrderId, "100.00", { type: "REVIEWER", id: "probe" })),
  );
  const [refundTotal] = await db.select({ value: count() }).from(refunds).where(eq(refunds.orderId, refundOrderId));
  if (refundAttempts.filter((result) => result.status === "fulfilled").length !== 1 || refundTotal.value !== 1) {
    throw new Error("Duplicate-refund protection failed");
  }

  const approvalAttempts = await Promise.allSettled([
    reviewEscalation(escalationId, "APPROVE", "Reviewer A"),
    reviewEscalation(escalationId, "APPROVE", "Reviewer B"),
  ]);
  const cancellationEvents = await db
    .select({ id: actionEvents.id })
    .from(actionEvents)
    .where(eq(actionEvents.requestId, approvalRequestId));
  if (approvalAttempts.filter((result) => result.status === "fulfilled").length !== 1 || cancellationEvents.length !== 2) {
    throw new Error("Double-approval protection failed");
  }

  console.log("Concurrency checks passed: one refund and one approval executed.");
  } finally {
    await db.delete(actionEvents).where(inArray(actionEvents.requestId, requestIds));
    await db.delete(refunds).where(eq(refunds.orderId, refundOrderId));
    await db.delete(escalations).where(eq(escalations.id, escalationId));
    await db.delete(supportRequests).where(inArray(supportRequests.id, requestIds));
    await db.delete(orders).where(inArray(orders.id, [refundOrderId, cancelOrderId]));
    await db.delete(customers).where(eq(customers.id, customerId));
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
