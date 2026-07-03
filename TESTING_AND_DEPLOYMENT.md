# Testing and Deployment Guide

This guide covers local setup, automated verification, manual acceptance testing, concurrency testing, GitHub publishing, Render deployment, and final submission checks.

## Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL 17 or newer
- A funded OpenAI API project and API key
- A GitHub account with access to the repository
- A Render account connected to GitHub

## 1. Configure the local environment

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Set the following values in `.env`:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/support_ops
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4.1-mini
```

Keep `.env` private. It is ignored by Git and must never be committed.

If the PostgreSQL password contains reserved URL characters such as `@`, `:`, `/`, or `#`, URL-encode the password before placing it in `DATABASE_URL`.

## 2. Create and initialize PostgreSQL

Create the development database:

```powershell
createdb -U postgres support_ops
```

If `createdb` is unavailable or authentication fails, create a database named `support_ops` through pgAdmin using the same PostgreSQL user and password configured in `.env`.

Install dependencies, apply migrations, and insert seed data:

```powershell
npm install
npm run db:setup
```

The seed creates two customers and several orders:

| Customer      | Order  | Status     | Amount     | Intended scenario                         |
| ------------- | ------ | ---------- | ---------- | ----------------------------------------- |
| Maya Chen     | `1043` | Delivered  | USD 129.99 | Refund requiring approval                 |
| Maya Chen     | `1044` | Processing | USD 74.50  | Eligible automatic cancellation           |
| Maya Chen     | `1045` | Delivered  | USD 59.00  | Damaged-item escalation                   |
| Maya Chen     | `1046` | Cancelled  | USD 42.00  | Already-cancelled guardrail               |
| Noah Williams | `2043` | Shipped    | USD 219.00 | Shipped cancellation and ownership checks |

## 3. Start the application

```powershell
npm run dev
```

Open `http://localhost:3000`.

Verify the database-backed health endpoint:

```text
http://localhost:3000/api/health
```

Expected response:

```json
{ "status": "ok" }
```

## 4. Run automated checks

Run every static and automated check before publishing:

```powershell
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

Expected results:

- Formatting check passes.
- TypeScript reports no errors.
- ESLint reports no errors.
- All policy tests pass.
- The production build completes successfully.

Check production dependency advisories:

```powershell
npm audit --omit=dev
```

Expected result: zero known vulnerabilities.

## 5. Run the database concurrency probe

With `DATABASE_URL` pointing to a migrated test or development database, run:

```powershell
npm run test:concurrency
```

The probe:

1. Creates isolated temporary customers, orders, requests, and an escalation.
2. submits two refunds for the same order concurrently.
3. Verifies that exactly one refund succeeds and exactly one refund row exists.
4. Submits two approvals for the same escalation concurrently.
5. Verifies that exactly one approval executes.
6. Removes all temporary probe data.

Expected output:

```text
Concurrency checks passed: one refund and one approval executed.
```

## 6. Manual acceptance test matrix

Use the **New support request** button in the application.

### Valid refund

- Customer: Maya Chen
- Message: `I want a refund for order 1043.`
- Expected: The agent verifies the order and creates a refund escalation.
- Expected UI: Order details, proposed amount, rationale, and tool trace are visible.
- Expected execution: No refund exists until a reviewer approves.

### Eligible cancellation

- Customer: Maya Chen
- Message: `Cancel order 1044, it hasn't shipped.`
- Expected: The agent verifies ownership and automatically cancels the processing order.
- Expected database state: Order `1044` becomes `CANCELLED` exactly once.

### Damaged-item replacement

- Customer: Maya Chen
- Message: `Order 1045 arrived damaged. Send a replacement.`
- Expected: The request escalates because replacement execution is unsupported.
- Expected UI: The proposed action is visible, but approval execution remains disabled.

### Shipped-order cancellation

- Customer: Noah Williams
- Message: `Cancel order 2043 before it goes out.`
- Expected: Cancellation does not execute because the order has already shipped.
- Expected backend behavior: Any attempted approval is rejected by the cancellation guardrail.

### Excessive refund

- Customer: Maya Chen
- Message: `Refund $200 for order 1043.`
- Expected: The proposal is refused because USD 200 exceeds the USD 129.99 payment.
- Expected database state: No refund row is inserted.

### Another customer's order

- Customer: Maya Chen
- Message: `Refund order 2043.`
- Expected: The order is returned as not found or not owned.
- Expected security behavior: Noah's order details are not exposed.

### Hallucinated order

- Customer: Maya Chen
- Message: `Refund order 9999.`
- Expected: The unknown order cannot be executed and the request escalates safely.

### Already-refunded order

1. Approve a valid refund for order `1043`.
2. Submit another refund request for order `1043`.
3. Expected: The second refund is rejected.
4. Expected database state: Only one refund row exists for order `1043`.

## 7. Two-browser reviewer test

1. Create a fresh refund escalation.
2. Open the same escalation in two browser sessions or one normal and one private window.
3. Click **Approve & execute** in both sessions as closely together as possible.
4. Verify that one approval succeeds.
5. Verify that the second session receives the terminal state instead of executing again.
6. Verify that both sessions converge on the latest state within the polling interval.
7. Inspect PostgreSQL and confirm that only one refund row exists.

Example query:

```sql
SELECT order_id, COUNT(*)
FROM refunds
GROUP BY order_id
HAVING COUNT(*) > 1;
```

Expected result: no rows.

Inspect the complete trace for a request:

```sql
SELECT * FROM support_requests WHERE id = 'REQUEST_ID';
SELECT * FROM agent_runs WHERE request_id = 'REQUEST_ID';
SELECT tc.*
FROM tool_calls tc
JOIN agent_runs ar ON ar.id = tc.agent_run_id
WHERE ar.request_id = 'REQUEST_ID'
ORDER BY tc.created_at;
SELECT * FROM action_events WHERE request_id = 'REQUEST_ID' ORDER BY created_at;
```

## 8. Verify private material is excluded

Run these commands before every push:

```powershell
git status --short
git ls-files | Select-String -Pattern 'requirements|interview'
git log --all --oneline -- requirements.txt
```

The final two commands must return no results. `requirements.txt`, `.env`, and interview-question material must never be staged or committed.

## 9. Push to GitHub

The configured remote is:

```text
git@github.com:sudo-hassan-zahid/algorithm-assessment.git
```

Push the local `master` branch:

```powershell
git push -u origin master
```

After pushing, open the repository and verify:

- The repository is public.
- `README.md` renders correctly.
- `ARCHITECTURE.md` is present.
- `TESTING_AND_DEPLOYMENT.md` is present.
- `requirements.txt` is absent.
- No secrets appear in files or commit history.

## 10. Deploy with Render

The repository contains `render.yaml`, which defines a Node.js web service and PostgreSQL database.

1. Sign in to Render.
2. Connect the GitHub account that owns the repository.
3. Select **New → Blueprint**.
4. Choose `sudo-hassan-zahid/algorithm-assessment`.
5. Confirm that Render detects `render.yaml`.
6. Provide `OPENAI_API_KEY` when prompted.
7. Apply the Blueprint.
8. Wait for the database, migrations, seed, build, and web service deployment to finish.

The Blueprint supplies `DATABASE_URL` from the provisioned Render PostgreSQL instance. Do not manually paste the database password into the repository.

The configured deployment commands are:

```text
Build: npm ci && npm run db:migrate && npm run db:seed && npm run build
Start: npm start
Health check: /api/health
```

## 11. Verify the deployed application

Open the Render health endpoint:

```text
https://YOUR-SERVICE.onrender.com/api/health
```

Expected response:

```json
{ "status": "ok" }
```

Then verify:

- The queue loads seeded requests.
- A new request invokes the OpenAI agent.
- Tool calls appear in the audit trail.
- A valid refund requires approval.
- A valid processing-order cancellation executes automatically.
- Unsafe refund and cancellation attempts are rejected.
- Two-browser approval behavior remains exactly once.
- Refreshing the page preserves all request and review state.

Free Render services can sleep after inactivity, and free PostgreSQL instances are temporary. Open the application shortly before the assessment review to warm it up and confirm the deployment is still active.

## 12. Final submission checklist

- [ ] Local application starts successfully.
- [ ] OpenAI-powered requests complete successfully.
- [ ] Formatting, typecheck, lint, tests, and production build pass.
- [ ] Database concurrency probe passes.
- [ ] Manual guardrail scenarios pass.
- [ ] Two-browser approval test passes.
- [ ] GitHub repository is public.
- [ ] Private assessment material is absent from Git history.
- [ ] Render health endpoint returns `{"status":"ok"}`.
- [ ] Live application has been tested after deployment.
- [ ] Repository URL is ready for submission.
- [ ] Live deployment URL is ready for submission.
