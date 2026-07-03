import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

export const requestStatus = pgEnum("request_status", [
  "PENDING",
  "PROCESSING",
  "AUTO_EXECUTED",
  "ESCALATED",
  "APPROVED",
  "REJECTED",
  "FAILED",
]);

export const runStatus = pgEnum("run_status", ["RUNNING", "COMPLETED", "FAILED"]);
export const toolCallStatus = pgEnum("tool_call_status", ["SUCCEEDED", "FAILED"]);
export const escalationStatus = pgEnum("escalation_status", ["PENDING", "APPROVED", "REJECTED"]);
export const actionType = pgEnum("action_type", ["REFUND", "CANCEL", "REPLACEMENT", "OTHER"]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    status: orderStatus("status").notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_customer_idx").on(table.customerId),
    check("orders_total_amount_positive", sql`${table.totalAmount} > 0`),
  ],
);

export const supportRequests = pgTable(
  "support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    message: text("message").notNull(),
    status: requestStatus("status").notNull().default("PENDING"),
    decision: text("decision"),
    decisionReason: text("decision_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("support_requests_status_created_idx").on(table.status, table.createdAt),
    check("support_requests_message_length", sql`length(${table.message}) between 3 and 2000`),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => supportRequests.id),
    model: text("model").notNull(),
    status: runStatus("status").notNull().default("RUNNING"),
    finalOutcome: text("final_outcome"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("agent_runs_request_idx").on(table.requestId)],
);

export const toolCalls = pgTable(
  "tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    providerCallId: text("provider_call_id").notNull(),
    name: text("name").notNull(),
    arguments: jsonb("arguments").notNull(),
    result: jsonb("result").notNull(),
    status: toolCallStatus("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("tool_calls_run_provider_call_key").on(table.agentRunId, table.providerCallId),
  ],
);

export const escalations = pgTable(
  "escalations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => supportRequests.id),
    orderId: text("order_id").references(() => orders.id),
    action: actionType("action").notNull(),
    proposedAmount: numeric("proposed_amount", { precision: 12, scale: 2 }),
    reason: text("reason").notNull(),
    status: escalationStatus("status").notNull().default("PENDING"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("escalations_request_key").on(table.requestId),
    index("escalations_status_created_idx").on(table.status, table.createdAt),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => supportRequests.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("refunds_order_key").on(table.orderId),
    uniqueIndex("refunds_request_key").on(table.requestId),
    check("refunds_amount_positive", sql`${table.amount} > 0`),
  ],
);

export const actionEvents = pgTable(
  "action_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => supportRequests.id),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("action_events_request_created_idx").on(table.requestId, table.createdAt),
    check(
      "action_events_actor_type_valid",
      sql`${table.actorType} in ('CUSTOMER', 'AGENT', 'REVIEWER', 'SYSTEM')`,
    ),
  ],
);

export type ActionType = (typeof actionType.enumValues)[number];
export type OrderStatus = (typeof orderStatus.enumValues)[number];
