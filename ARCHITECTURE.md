# Relay Architecture

Relay is a TypeScript monolith with three explicit boundaries: a reviewer-facing Next.js client, server routes and an agent orchestrator, and PostgreSQL as the source of truth. Keeping those boundaries in one deployable service minimizes operational surface for the assessment while preserving separable modules for production extraction.

## Agent boundary

The model may read a customer-owned order, propose a refund, cancel an eligible order, or escalate. Refunds always require human approval. Cancellation is the only autonomous mutation, and only a verified `PROCESSING` order can be cancelled. Replacements, ambiguous requests, unknown orders, ownership failures, unsafe amounts, and tool failures go to a reviewer.

This is a code boundary, not a prompt convention:

- `src/server/agent/tools.ts` exposes four narrow tools and binds every lookup to the request's customer. Tool arguments are parsed with Zod. Finalizing tools refuse a request that has already left `PROCESSING`.
- `src/domain/policy.ts` defines deterministic refund and cancellation policy.
- `src/server/guardrails.ts` reloads and locks the order before every mutation. It rejects over-refunds, non-positive refunds, cancelled-order refunds, wrong-customer orders, and cancellation after shipment.
- `src/server/escalations.ts` locks the escalation and runs approval, policy validation, execution, state transition, and audit writes in one database transaction.
- PostgreSQL adds the final invariants: positive amount checks and unique constraints on both `refunds.order_id` and `refunds.request_id`.

The prompt describes policy so the model can make useful choices, but no privileged operation trusts the model's statement that a request is safe.

## Tool and data design

The Responses API loop in `src/server/agent/run.ts` sends the customer message, accepts model-selected function calls, executes them, returns tool outputs, and repeats for at most eight rounds. The sequence is not hardcoded. A tool-budget exhaustion or provider failure escalates safely.

`get_order` returns only operational fields needed for a decision and only when the order belongs to the requesting customer. `request_refund` validates the proposal but only creates an escalation. `cancel_order` invokes the guarded mutation. `escalate_request` records cases the system cannot safely execute. These task-oriented APIs expose less data and authority than generic CRUD or SQL tools, reducing both accidental misuse and prompt-injection impact.

Each support request owns agent runs, provider call IDs, arguments, results, outcomes, escalation state, and append-only action events. The console shows a concise decision rationale and verified facts rather than private model chain-of-thought. The stored records are sufficient to reconstruct which tools ran and which code-controlled action occurred.

## Concurrency and failure handling

Refund execution uses `SELECT ... FOR UPDATE` on the order. Concurrent requests for one order serialize; after the first commits, the second sees the existing refund and fails with `ALREADY_REFUNDED`. Even if application locking regresses, the database unique index on `refunds.order_id` prevents a second row.

Approval uses `SELECT ... FOR UPDATE` on the escalation. Two reviewers therefore cannot both observe `PENDING` inside their transactions. The winner executes and commits `APPROVED`; the loser then reads the terminal state and receives HTTP 409. The UI polls and revalidates immediately after every review attempt, so the second browser replaces stale state with the committed result.

Failure behavior is conservative:

- A hallucinated or foreign order ID is indistinguishable from not found to the agent and cannot be attached as a verified order.
- An excessive refund is rejected both during proposal and again under lock during execution.
- An existing refund is checked under lock and protected by a unique constraint.
- A shipped, delivered, or cancelled order fails the cancellation policy.
- Unknown and unsupported actions remain reviewable but their approve button is disabled; the backend also rejects execution.
- LLM/provider failures produce a failed agent run and an `OTHER` escalation rather than dropping the request.

`scripts/concurrency-check.ts` provides a repeatable database race for duplicate refunds and double approval.

## Significant decisions

### PostgreSQL locking plus constraints

I chose pessimistic row locking for guarded actions because contention is localized by order or escalation and correctness is more valuable than maximum throughput. Optimistic versions alone would detect conflicts but require more retry orchestration, while an in-memory mutex would fail across processes. Unique constraints remain the non-bypassable duplicate-refund backstop.

### Narrow agent tools over a general order API

Task-specific tools make authority visible and independently testable. A generic mutation tool would move too much policy into prompts or require a complex permission layer. The tradeoff is adding a tool for each supported operation, which is desirable here because each operation has distinct risk.

### Polling with conflict revalidation

SWR polls every three seconds and refreshes immediately after review. This gives honest state across browser sessions without introducing a realtime service for a small console. WebSockets or server-sent events would reduce latency at larger scale, but would not replace transactional conflict handling.

## Build versus buy at scale

The current request route performs the agent run synchronously for a small assessment deployment. In production I would acknowledge intake immediately and enqueue a durable job with SQS, Cloud Tasks, or Temporal; use idempotency keys, bounded retries, and a dead-letter queue. Temporal would be attractive once approval timers and multi-step fulfillment become long-running workflows.

The explicit loop is intentionally small and inspectable. I would keep it while the tool set is modest, then evaluate an agent framework only if durable orchestration, evaluation hooks, or multi-agent routing justify its abstraction cost. Payments and fulfillment would call provider APIs with their own idempotency keys rather than treating the local row as proof of an external refund.

For operations I would add OpenTelemetry traces, structured logs with request/run IDs, Sentry, metrics for escalation rate and guardrail rejections, encrypted secrets, retention controls, reviewer authentication with RBAC, and immutable audit export. Managed PostgreSQL with point-in-time recovery, connection pooling, private networking, and automated backups would replace the assessment database. Rate limiting, CSRF protection, and verified customer identity would sit ahead of public intake.

