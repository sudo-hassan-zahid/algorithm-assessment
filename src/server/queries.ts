/*
 * Shapes the queue, request detail, and customer detail payloads consumed by the console UI.
 */
import { asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  actionEvents,
  agentRuns,
  customers,
  escalations,
  orders,
  refunds,
  supportRequests,
  toolCalls,
} from "@/db/schema";

export async function listSupportRequests() {
  return db
    .select({
      id: supportRequests.id,
      message: supportRequests.message,
      status: supportRequests.status,
      decision: supportRequests.decision,
      decisionReason: supportRequests.decisionReason,
      createdAt: supportRequests.createdAt,
      updatedAt: supportRequests.updatedAt,
      customer: {
        id: customers.id,
        name: customers.name,
        email: customers.email,
      },
      escalation: {
        id: escalations.id,
        status: escalations.status,
        action: escalations.action,
        reason: escalations.reason,
      },
    })
    .from(supportRequests)
    .innerJoin(customers, eq(customers.id, supportRequests.customerId))
    .leftJoin(escalations, eq(escalations.requestId, supportRequests.id))
    .orderBy(desc(supportRequests.createdAt));
}

export async function getSupportRequest(id: string) {
  const [request] = await db
    .select({
      id: supportRequests.id,
      message: supportRequests.message,
      status: supportRequests.status,
      decision: supportRequests.decision,
      decisionReason: supportRequests.decisionReason,
      createdAt: supportRequests.createdAt,
      updatedAt: supportRequests.updatedAt,
      customer: {
        id: customers.id,
        name: customers.name,
        email: customers.email,
      },
    })
    .from(supportRequests)
    .innerJoin(customers, eq(customers.id, supportRequests.customerId))
    .where(eq(supportRequests.id, id))
    .limit(1);
  if (!request) return null;

  const [escalation, runs, events] = await Promise.all([
    db
      .select({
        id: escalations.id,
        status: escalations.status,
        action: escalations.action,
        proposedAmount: escalations.proposedAmount,
        reason: escalations.reason,
        reviewedBy: escalations.reviewedBy,
        reviewedAt: escalations.reviewedAt,
        order: {
          id: orders.id,
          status: orders.status,
          totalAmount: orders.totalAmount,
          currency: orders.currency,
          version: orders.version,
        },
      })
      .from(escalations)
      .leftJoin(orders, eq(orders.id, escalations.orderId))
      .where(eq(escalations.requestId, id))
      .limit(1),
    db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.requestId, id))
      .orderBy(asc(agentRuns.startedAt)),
    db
      .select()
      .from(actionEvents)
      .where(eq(actionEvents.requestId, id))
      .orderBy(asc(actionEvents.createdAt)),
  ]);

  const calls = runs.length
    ? await db
        .select()
        .from(toolCalls)
        .where(
          inArray(
            toolCalls.agentRunId,
            runs.map((run) => run.id),
          ),
        )
        .orderBy(asc(toolCalls.createdAt))
    : [];
  const refund = escalation[0]?.order?.id
    ? ((
        await db
          .select()
          .from(refunds)
          .where(eq(refunds.orderId, escalation[0].order.id))
          .limit(1)
      )[0] ?? null)
    : null;

  return {
    ...request,
    escalation: escalation[0] ?? null,
    agentRuns: runs,
    toolCalls: calls,
    events,
    refund,
  };
}

export function listCustomers() {
  return db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      createdAt: customers.createdAt,
      orderCount: sql<number>`count(${orders.id})`,
    })
    .from(customers)
    .leftJoin(orders, eq(orders.customerId, customers.id))
    .groupBy(customers.id)
    .orderBy(asc(customers.name));
}

export async function getCustomer(id: string) {
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      email: customers.email,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);
  if (!customer) return null;

  const customerOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalAmount: orders.totalAmount,
      currency: orders.currency,
      version: orders.version,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(eq(orders.customerId, id))
    .orderBy(desc(orders.createdAt));

  return {
    ...customer,
    orderCount: customerOrders.length,
    orders: customerOrders,
  };
}
