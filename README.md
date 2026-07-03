# Relay Support Operations Console

Relay is a reviewer-first ecommerce support console backed by a real Groq tool-calling loop. It handles refund proposals, safe automatic cancellations, escalation review, and a complete database audit trail.

## Stack

- Next.js 16 and TypeScript
- PostgreSQL 17 with Drizzle ORM
- Groq Responses API through its OpenAI-compatible endpoint
- SWR for concurrent UI refresh
- Vitest for policy tests

## Local setup

Requirements: Node.js 22+, PostgreSQL 17+, and a free Groq API key.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:setup
npm run dev
```

Open `http://localhost:3000`. The seed includes customers, orders, pending reviews, an automatic action, and trace data. New requests invoke the configured model.

If PostgreSQL already runs locally, create a `support_ops` database and set `DATABASE_URL` instead of using Docker.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:concurrency
```

`test:concurrency` creates isolated temporary records in the configured database, races two refunds and two approvals, verifies exactly-once outcomes, then removes its data. Run migrations first.

## Safety model

- Refunds always require approval.
- Cancellations execute automatically only for verified, customer-owned `PROCESSING` orders.
- Row locks serialize competing mutations.
- A unique `refunds.order_id` constraint is the final duplicate-refund backstop.
- Approval, guarded execution, status transition, and audit event commit in one transaction.
- The UI polls every three seconds and refreshes immediately after review conflicts.

The exact enforcement paths are documented in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Deployment

`render.yaml` provisions the web service and PostgreSQL database on Render. Create a Blueprint from the repository and provide `GROQ_API_KEY`; migrations and seed data run during the build.

For another platform, use:

- Build: `npm ci && npm run db:migrate && npm run db:seed && npm run build`
- Start: `npm start`
- Health check: `/api/health`

## API surface

| Method | Route                         | Purpose                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| `GET`  | `/api/requests`               | Queue snapshot                             |
| `POST` | `/api/requests`               | Create and process a customer request      |
| `GET`  | `/api/requests/:id`           | Decision, order, trace, and audit detail   |
| `POST` | `/api/escalations/:id/review` | Atomically approve or reject an escalation |
| `GET`  | `/api/customers`              | Seeded intake customers                    |
| `GET`  | `/api/health`                 | Database-backed health check               |
