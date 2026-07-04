# Relay Support Operations Console

Relay is a reviewer-first ecommerce support console backed by a real Groq tool-calling loop. It handles refund proposals, safe automatic cancellations, escalation review, and a complete database audit trail.

## Tech stack

- Next.js 16 and TypeScript
- PostgreSQL 17 with Drizzle ORM
- Groq Responses API through its OpenAI-compatible endpoint
- OpenAPI 3.1 documentation at `/swagger`
- SWR for concurrent UI refresh
- Vitest for policy tests

## Local setup options

Requirements: Docker, Node.js 22+, npm, and a free Groq API key.

Copy `.env.example` to `.env`, add your `GROQ_API_KEY`, then choose one of the
two local workflows below.

### Option 1: full Docker workflow

Start the complete stack:

```bash
cp .env.example .env
docker compose up --build
```

Use this when you want the simplest startup path. Compose installs the app,
waits for PostgreSQL, runs migrations, loads the idempotent demo seed, and
starts the server at `http://localhost:3000`.

### Option 2: Docker DB + host app

This repo is one Next.js app, so the frontend and backend are served by the
same dev process. Use Docker Compose just for PostgreSQL, then run the app on
the host for hot reload.

Install dependencies once:

```bash
npm install
```

Then start the app with the script that matches your OS:

Linux or macOS:

```bash
bash ./dev.sh
```

Windows PowerShell:

```powershell
.\dev.ps1
```

Windows Command Prompt:

```bat
dev.bat
```

Each script starts the `postgres` service and then runs `npm run dev`. The
`predev` hook waits for PostgreSQL, runs migrations, and loads the idempotent
seed before Next.js starts.

If you prefer not to use the script, the equivalent commands are:

```bash
docker compose up -d postgres
npm run dev
```

This host-based workflow uses PostgreSQL on port `5777` to avoid conflicts with
local databases already running on `5432`.

`npm start` automatically runs migrations without loading demo data.

## App overview

- Reviewer-first support queue with clear states for `PROCESSING`, `ESCALATED`, `APPROVED`, and `AUTO_EXECUTED`
- Customer workspace to inspect seeded customer profiles and drill into each order on demand
- Real Groq-backed request processing with tool calls, audit history, and guarded execution
- Idempotent demo seed with 19 customers, 79 orders, and mixed support scenarios for review/testing
- Interactive API docs at [`/swagger`](http://localhost:3000/swagger) and raw OpenAPI at [`/api/openapi`](http://localhost:3000/api/openapi)

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

`render.yaml` provisions the web service and PostgreSQL database on Render.
Create a Blueprint from the repository, provide `GROQ_API_KEY`, and startup
will run migrations plus idempotent demo data automatically.

For another platform, use:

- Build: `npm ci && npm run build`
- Start with migrations: `npm start`
- Start with migrations and demo data: `npm run start:seeded`
- Health check: `/api/health`

## API surface

| Method | Route                         | Purpose                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| `GET`  | `/api/requests`               | Queue snapshot                             |
| `POST` | `/api/requests`               | Create and process a customer request      |
| `GET`  | `/api/requests/:id`           | Decision, order, trace, and audit detail   |
| `POST` | `/api/escalations/:id/review` | Atomically approve or reject an escalation |
| `GET`  | `/api/customers`              | Seeded intake customers                    |
| `GET`  | `/api/customers/:id`          | Customer profile with order history        |
| `GET`  | `/api/health`                 | Database-backed health check               |
