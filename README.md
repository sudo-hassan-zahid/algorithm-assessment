# Relay Support Operations Console

Relay is a reviewer-first ecommerce support console backed by a real Groq tool-calling loop. It handles refund proposals, safe automatic cancellations, escalation review, and a complete database audit trail.

## Stack

- Next.js 16 and TypeScript
- PostgreSQL 17 with Drizzle ORM
- Groq Responses API through its OpenAI-compatible endpoint
- OpenAPI 3.1 documentation at `/swagger`
- SWR for concurrent UI refresh
- Vitest for policy tests

## Local setup

Requirements: Docker, Node.js 22+, npm, and a free Groq API key.

Copy `.env.example` to `.env`, add your `GROQ_API_KEY`, then choose one of the
two local workflows below.

### Option 1: simplest full-container startup

Start the complete stack:

```bash
cp .env.example .env
docker compose up --build
```

After that one-time API key configuration, `docker compose up --build` is the
only setup and startup command. Do not run `npm install` on the host for this
fully containerized workflow.

Open `http://localhost:3000`. Compose installs the application, waits for
PostgreSQL, applies migrations, loads the idempotent demo seed, and starts the
server. New requests invoke the configured model.

### Option 2: Compose for DB, host app for hot reload

This repo is one Next.js app, so the frontend and backend are served by the
same dev process. Use Docker Compose just for PostgreSQL, then run the app on
the host:

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

`dev.sh`, `dev.ps1`, and `dev.bat` start the `postgres` service and then run
`npm run dev`. The `predev` hook automatically waits for PostgreSQL, runs
migrations, and loads the idempotent seed before Next.js starts.

If you prefer not to use the script, the equivalent commands are:

```bash
docker compose up -d postgres
npm run dev
```

The host-based workflow expects the Compose PostgreSQL container on port `5777`
to avoid colliding with an existing local PostgreSQL server on `5432`.

`npm start` automatically runs migrations without loading demo data.

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

`render.yaml` provisions the web service and PostgreSQL database on Render. Create a Blueprint from the repository and provide `GROQ_API_KEY`; migrations and idempotent seed data run when the service starts.

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
| `GET`  | `/api/health`                 | Database-backed health check               |

Interactive API documentation is available at [`/swagger`](http://localhost:3000/swagger),
with the raw OpenAPI document at [`/api/openapi`](http://localhost:3000/api/openapi).
