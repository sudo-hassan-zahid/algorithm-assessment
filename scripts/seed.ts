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

type CustomerSeed = {
  id: string;
  name: string;
  email: string;
  orders: Array<{
    id: string;
    status: "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
    totalAmount: string;
    version?: number;
  }>;
};

const customerSeeds: CustomerSeed[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Maya Chen",
    email: "maya@example.com",
    orders: [
      { id: "1043", status: "DELIVERED", totalAmount: "129.99" },
      { id: "1044", status: "PROCESSING", totalAmount: "74.50" },
      { id: "1045", status: "DELIVERED", totalAmount: "59.00" },
      { id: "1046", status: "CANCELLED", totalAmount: "42.00", version: 2 },
      { id: "1047", status: "SHIPPED", totalAmount: "31.40" },
      { id: "1048", status: "PROCESSING", totalAmount: "88.20" },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Noah Williams",
    email: "noah@example.com",
    orders: [
      { id: "2043", status: "SHIPPED", totalAmount: "219.00" },
      { id: "2044", status: "DELIVERED", totalAmount: "56.75" },
      { id: "2045", status: "PROCESSING", totalAmount: "143.10" },
      { id: "2046", status: "DELIVERED", totalAmount: "24.95" },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Ava Patel",
    email: "ava.patel@example.com",
    orders: [
      { id: "3041", status: "DELIVERED", totalAmount: "67.30" },
      { id: "3042", status: "PROCESSING", totalAmount: "114.00" },
      { id: "3043", status: "SHIPPED", totalAmount: "42.99" },
    ],
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Liam Johnson",
    email: "liam.johnson@example.com",
    orders: [
      { id: "4041", status: "DELIVERED", totalAmount: "189.50" },
      { id: "4042", status: "CANCELLED", totalAmount: "28.00", version: 2 },
      { id: "4043", status: "PROCESSING", totalAmount: "73.90" },
      { id: "4044", status: "DELIVERED", totalAmount: "16.99" },
    ],
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Sophia Martinez",
    email: "sophia.martinez@example.com",
    orders: [
      { id: "5041", status: "SHIPPED", totalAmount: "205.40" },
      { id: "5042", status: "DELIVERED", totalAmount: "81.25" },
      { id: "5043", status: "PROCESSING", totalAmount: "61.15" },
      { id: "5044", status: "DELIVERED", totalAmount: "39.99" },
      { id: "5045", status: "PROCESSING", totalAmount: "152.10" },
    ],
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Ethan Brown",
    email: "ethan.brown@example.com",
    orders: [
      { id: "6041", status: "DELIVERED", totalAmount: "45.00" },
      { id: "6042", status: "SHIPPED", totalAmount: "95.20" },
    ],
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Olivia Davis",
    email: "olivia.davis@example.com",
    orders: [
      { id: "7041", status: "PROCESSING", totalAmount: "58.45" },
      { id: "7042", status: "DELIVERED", totalAmount: "130.80" },
      { id: "7043", status: "DELIVERED", totalAmount: "22.30" },
      { id: "7044", status: "SHIPPED", totalAmount: "77.70" },
      { id: "7045", status: "PROCESSING", totalAmount: "121.00" },
      { id: "7046", status: "DELIVERED", totalAmount: "18.60" },
    ],
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    name: "James Wilson",
    email: "james.wilson@example.com",
    orders: [
      { id: "8041", status: "DELIVERED", totalAmount: "44.49" },
      { id: "8042", status: "CANCELLED", totalAmount: "91.00", version: 2 },
      { id: "8043", status: "SHIPPED", totalAmount: "140.35" },
    ],
  },
  {
    id: "99999999-9999-4999-8999-999999999999",
    name: "Isabella Moore",
    email: "isabella.moore@example.com",
    orders: [
      { id: "9041", status: "PROCESSING", totalAmount: "64.00" },
      { id: "9042", status: "DELIVERED", totalAmount: "148.20" },
      { id: "9043", status: "DELIVERED", totalAmount: "19.95" },
      { id: "9044", status: "SHIPPED", totalAmount: "210.00" },
    ],
  },
  {
    id: "aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Benjamin Taylor",
    email: "benjamin.taylor@example.com",
    orders: [
      { id: "10041", status: "DELIVERED", totalAmount: "33.33" },
      { id: "10042", status: "PROCESSING", totalAmount: "68.90" },
      { id: "10043", status: "PROCESSING", totalAmount: "15.20" },
      { id: "10044", status: "SHIPPED", totalAmount: "122.45" },
      { id: "10045", status: "DELIVERED", totalAmount: "47.10" },
    ],
  },
  {
    id: "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Mia Anderson",
    email: "mia.anderson@example.com",
    orders: [
      { id: "11041", status: "DELIVERED", totalAmount: "84.75" },
      { id: "11042", status: "CANCELLED", totalAmount: "55.55", version: 2 },
      { id: "11043", status: "SHIPPED", totalAmount: "142.00" },
      { id: "11044", status: "DELIVERED", totalAmount: "26.40" },
    ],
  },
  {
    id: "cccccccc-3333-4ccc-8ccc-cccccccccccc",
    name: "Lucas Thomas",
    email: "lucas.thomas@example.com",
    orders: [
      { id: "12041", status: "PROCESSING", totalAmount: "109.99" },
      { id: "12042", status: "DELIVERED", totalAmount: "57.25" },
    ],
  },
  {
    id: "dddddddd-4444-4ddd-8ddd-dddddddddddd",
    name: "Amelia Jackson",
    email: "amelia.jackson@example.com",
    orders: [
      { id: "13041", status: "DELIVERED", totalAmount: "72.10" },
      { id: "13042", status: "SHIPPED", totalAmount: "135.60" },
      { id: "13043", status: "PROCESSING", totalAmount: "94.30" },
      { id: "13044", status: "DELIVERED", totalAmount: "17.95" },
      { id: "13045", status: "PROCESSING", totalAmount: "199.00" },
      { id: "13046", status: "SHIPPED", totalAmount: "41.80" },
    ],
  },
  {
    id: "eeeeeeee-5555-4eee-8eee-eeeeeeeeeeee",
    name: "Henry White",
    email: "henry.white@example.com",
    orders: [
      { id: "14041", status: "DELIVERED", totalAmount: "63.45" },
      { id: "14042", status: "PROCESSING", totalAmount: "87.70" },
      { id: "14043", status: "DELIVERED", totalAmount: "154.90" },
    ],
  },
  {
    id: "ffffffff-6666-4fff-8fff-ffffffffffff",
    name: "Charlotte Harris",
    email: "charlotte.harris@example.com",
    orders: [
      { id: "15041", status: "SHIPPED", totalAmount: "49.99" },
      { id: "15042", status: "DELIVERED", totalAmount: "79.49" },
      { id: "15043", status: "PROCESSING", totalAmount: "112.35" },
      { id: "15044", status: "DELIVERED", totalAmount: "23.10" },
    ],
  },
  {
    id: "12121212-7777-4212-8212-121212121212",
    name: "Alexander Martin",
    email: "alexander.martin@example.com",
    orders: [
      { id: "16041", status: "PROCESSING", totalAmount: "132.00" },
      { id: "16042", status: "SHIPPED", totalAmount: "54.10" },
      { id: "16043", status: "DELIVERED", totalAmount: "201.25" },
      { id: "16044", status: "DELIVERED", totalAmount: "11.99" },
      { id: "16045", status: "PROCESSING", totalAmount: "98.75" },
    ],
  },
  {
    id: "23232323-8888-4232-8232-232323232323",
    name: "Harper Thompson",
    email: "harper.thompson@example.com",
    orders: [
      { id: "17041", status: "DELIVERED", totalAmount: "27.50" },
      { id: "17042", status: "SHIPPED", totalAmount: "76.20" },
      { id: "17043", status: "PROCESSING", totalAmount: "143.45" },
    ],
  },
  {
    id: "34343434-9999-4343-8343-343434343434",
    name: "Daniel Garcia",
    email: "daniel.garcia@example.com",
    orders: [
      { id: "18041", status: "DELIVERED", totalAmount: "58.88" },
      { id: "18042", status: "CANCELLED", totalAmount: "88.00", version: 2 },
      { id: "18043", status: "DELIVERED", totalAmount: "166.40" },
      { id: "18044", status: "PROCESSING", totalAmount: "34.25" },
    ],
  },
  {
    id: "45454545-1010-4545-8454-454545454545",
    name: "Evelyn Lewis",
    email: "evelyn.lewis@example.com",
    orders: [
      { id: "19041", status: "PROCESSING", totalAmount: "145.00" },
      { id: "19042", status: "DELIVERED", totalAmount: "52.35" },
      { id: "19043", status: "SHIPPED", totalAmount: "94.99" },
      { id: "19044", status: "DELIVERED", totalAmount: "29.90" },
      { id: "19045", status: "PROCESSING", totalAmount: "65.00" },
      { id: "19046", status: "DELIVERED", totalAmount: "14.80" },
    ],
  },
];

const requestSeeds = [
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    customerId: "11111111-1111-4111-8111-111111111111",
    message: "I want a refund for order 1043.",
    status: "ESCALATED" as const,
    decision: "REFUND",
    decisionReason:
      "Order 1043 belongs to Maya and the requested full refund matches the amount paid.",
    orderId: "1043",
    action: "REFUND" as const,
    proposedAmount: "129.99",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
    customerId: "11111111-1111-4111-8111-111111111111",
    message: "Cancel order 1044, it hasn't shipped.",
    status: "AUTO_EXECUTED" as const,
    decision: "CANCEL",
    decisionReason:
      "The verified order was still processing and eligible for automatic cancellation.",
    orderId: "1044",
    action: "CANCEL" as const,
    proposedAmount: null,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
    customerId: "22222222-2222-4222-8222-222222222222",
    message: "Please cancel order 2043 before it goes out.",
    status: "ESCALATED" as const,
    decision: "CANCEL",
    decisionReason:
      "The verified order has already shipped, so cancellation is blocked and needs review.",
    orderId: "2043",
    action: "CANCEL" as const,
    proposedAmount: null,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
    customerId: "33333333-3333-4333-8333-333333333333",
    message: "Refund order 3041, it arrived with missing parts.",
    status: "ESCALATED" as const,
    decision: "REFUND",
    decisionReason:
      "The delivered order belongs to Ava and the agent proposed a reviewer-approved refund.",
    orderId: "3041",
    action: "REFUND" as const,
    proposedAmount: "67.30",
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
    customerId: "77777777-7777-4777-8777-777777777777",
    message: "Cancel order 7041 before it ships.",
    status: "AUTO_EXECUTED" as const,
    decision: "CANCEL",
    decisionReason:
      "The verified order was still processing and eligible for automatic cancellation.",
    orderId: "7041",
    action: "CANCEL" as const,
    proposedAmount: null,
  },
  {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
    customerId: "ffffffff-6666-4fff-8fff-ffffffffffff",
    message: "Order 15041 arrived damaged. Please send a replacement.",
    status: "ESCALATED" as const,
    decision: "REPLACEMENT",
    decisionReason:
      "Replacement execution is unsupported, so the case was escalated for human review.",
    orderId: "15041",
    action: "REPLACEMENT" as const,
    proposedAmount: null,
  },
];

function flattenOrders() {
  return customerSeeds.flatMap((customer) =>
    customer.orders.map((order) => ({
      id: order.id,
      customerId: customer.id,
      status: order.status,
      totalAmount: order.totalAmount,
      version: order.version ?? 1,
    })),
  );
}

async function main() {
  await db
    .insert(customers)
    .values(
      customerSeeds.map(({ id, name, email }) => ({
        id,
        name,
        email,
      })),
    )
    .onConflictDoNothing();

  await db.insert(orders).values(flattenOrders()).onConflictDoNothing();

  await db
    .insert(supportRequests)
    .values(
      requestSeeds.map(
        ({ id, customerId, message, status, decision, decisionReason }) => ({
          id,
          customerId,
          message,
          status,
          decision,
          decisionReason,
        }),
      ),
    )
    .onConflictDoNothing();

  await db
    .insert(escalations)
    .values(
      requestSeeds
        .filter((request) => request.status === "ESCALATED")
        .map(
          ({
            id,
            orderId,
            action,
            proposedAmount,
            decisionReason,
          }) => ({
            id: `bbbbbbbb-bbbb-4bbb-8bbb-${id.slice(-12)}`,
            requestId: id,
            orderId,
            action,
            proposedAmount,
            reason: decisionReason,
          }),
        ),
    )
    .onConflictDoNothing();

  for (const [index, request] of requestSeeds.entries()) {
    const runId = `cccccccc-cccc-4ccc-8ccc-ccccccccccc${index + 1}`;
    const insertedRun = await db
      .insert(agentRuns)
      .values({
        id: runId,
        requestId: request.id,
        model: "seeded-demo",
        status: "COMPLETED",
        finalOutcome: request.decisionReason,
        finishedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: agentRuns.id });
    if (!insertedRun.length) continue;

    await db.insert(toolCalls).values({
      agentRunId: runId,
      providerCallId: `seed-call-${index + 1}`,
      name: "get_order",
      arguments: { order_id: request.orderId },
      result: { ok: true, verifiedOwner: true },
      status: "SUCCEEDED",
    });
    await db.insert(actionEvents).values({
      requestId: request.id,
      actorType: "AGENT",
      eventType:
        request.status === "AUTO_EXECUTED" ? "ORDER_CANCELLED" : "ESCALATED",
      details: { seeded: true },
    });
  }

  await pool.end();
  console.log(
    `Seed data ready: ${customerSeeds.length} customers, ${flattenOrders().length} orders, ${requestSeeds.length} support requests.`,
  );
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
