import "dotenv/config";
import { eq } from "drizzle-orm";

import { db, pool } from "../src/db";
import {
  actionEvents,
  agentRuns,
  customers,
  escalations,
  orders,
  supportRequests,
  toolCalls,
} from "../src/db/schema";

const customerIds = {
  maya: "11111111-1111-4111-8111-111111111111",
  noah: "22222222-2222-4222-8222-222222222222",
};

await db
  .insert(customers)
  .values([
    { id: customerIds.maya, name: "Maya Chen", email: "maya@example.com" },
    { id: customerIds.noah, name: "Noah Williams", email: "noah@example.com" },
  ])
  .onConflictDoNothing();

await db
  .insert(orders)
  .values([
    { id: "1043", customerId: customerIds.maya, status: "DELIVERED", totalAmount: "129.99" },
    { id: "1044", customerId: customerIds.maya, status: "PROCESSING", totalAmount: "74.50" },
    { id: "1045", customerId: customerIds.maya, status: "DELIVERED", totalAmount: "59.00" },
    { id: "1046", customerId: customerIds.maya, status: "CANCELLED", totalAmount: "42.00", version: 2 },
    { id: "2043", customerId: customerIds.noah, status: "SHIPPED", totalAmount: "219.00" },
  ])
  .onConflictDoNothing();

const requestSeeds = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    customerId: customerIds.maya,
    message: "I want a refund for order 1043.",
    status: "ESCALATED" as const,
    decision: "REFUND",
    decisionReason: "Order 1043 belongs to Maya and the requested full refund matches the amount paid.",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    customerId: customerIds.maya,
    message: "Cancel order 1046, it hasn't shipped.",
    status: "AUTO_EXECUTED" as const,
    decision: "CANCEL",
    decisionReason: "The verified order was still processing and eligible for automatic cancellation.",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    customerId: customerIds.noah,
    message: "Please cancel order 2043 before it goes out.",
    status: "ESCALATED" as const,
    decision: "CANCEL",
    decisionReason: "The verified order has already shipped, so cancellation is blocked and needs review.",
  },
];

await db.insert(supportRequests).values(requestSeeds).onConflictDoNothing();

await db
  .insert(escalations)
  .values([
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      requestId: requestSeeds[0].id,
      orderId: "1043",
      action: "REFUND",
      proposedAmount: "129.99",
      reason: requestSeeds[0].decisionReason,
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
      requestId: requestSeeds[2].id,
      orderId: "2043",
      action: "CANCEL",
      reason: requestSeeds[2].decisionReason,
    },
  ])
  .onConflictDoNothing();

for (const [index, request] of requestSeeds.entries()) {
  const runId = `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index + 1}`;
  const [existingRun] = await db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.id, runId)).limit(1);
  if (existingRun) continue;

  await db.insert(agentRuns).values({
    id: runId,
    requestId: request.id,
    model: "seeded-demo",
    status: "COMPLETED",
    finalOutcome: request.decisionReason,
    finishedAt: new Date(),
  });
  await db.insert(toolCalls).values({
    agentRunId: runId,
    providerCallId: `seed-call-${index + 1}`,
    name: "get_order",
    arguments: { order_id: index === 2 ? "2043" : `104${3 + index}` },
    result: { ok: true, verifiedOwner: true },
    status: "SUCCEEDED",
  });
  await db.insert(actionEvents).values({
    requestId: request.id,
    actorType: "AGENT",
    eventType: request.status === "AUTO_EXECUTED" ? "ORDER_CANCELLED" : "ESCALATED",
    details: { seeded: true },
  });
}

await pool.end();
console.log("Seed data ready.");

