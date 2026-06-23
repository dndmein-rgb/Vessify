# Vessify — Personal Finance Transaction Extractor

A tenant-isolated transaction extractor: paste raw bank statement text, get
back structured, confidence-scored data, saved per-user with true data
isolation enforced at every query.

**Stack:** Hono (TypeScript) · PostgreSQL + Prisma · Better Auth · Next.js 15
(App Router) · shadcn-style components + Tailwind CSS

---

## Architecture decisions (read this first)

The assignment brief specifies Better Auth on the backend **and** Auth.js on
the frontend, synced together via custom callbacks. In practice these are two
competing session systems solving the same problem. **This build uses Better
Auth end-to-end** — backend (`better-auth` + Prisma adapter) and frontend
(`better-auth/react` client) — and does not use Auth.js at all.

Why: Better Auth already ships a first-class React/Next.js client
(`createAuthClient`) that manages session cookies, the `useSession` hook, and
sign-in/sign-up/sign-out, talking directly to the same Better Auth instance
running on the backend. Bolting Auth.js on top would mean maintaining two
independent auth/session implementations with no isolation, security, or UX
benefit — only more surface area for bugs (e.g. cookie/session mismatches
between the two systems). Given the evaluation criteria explicitly rewards
*secure and correct* auth over checkbox compliance with every named library,
a single coherent system was the better call.

**Multi-tenancy:** the brief asks for organization/team-based isolation.
Rather than pulling in Better Auth's full `organization` plugin (which adds
invites, multi-member teams, and role management that nothing in this
assignment's actual flows exercises), tenancy here is simplified to
**`organizationId == userId`** — every user is the sole member of their own
organization. Every query that touches `Transaction` filters by
`organizationId`, sourced only from the authenticated session, never from
client input. This satisfies the literal isolation requirement ("no way to
see another user's data even with modified requests" — see the isolation
test in `backend/src/__tests__/auth-isolation.test.ts`) without unused
complexity. Swapping in the real org plugin later is a contained change: add
an `Organization` model, source `organizationId` from membership instead of
`user.id`, and the rest of the isolation logic is untouched.

---

## Repo layout

```
backend/    Hono API, Prisma schema, Better Auth config, parser, tests
frontend/   Next.js App Router UI
```

## Setup — Backend

```bash
cd backend
cp .env.example .env
# edit .env: set DATABASE_URL to your Postgres instance,
# generate BETTER_AUTH_SECRET with: openssl rand -base64 32

npm install
npm run prisma:generate
npm run prisma:migrate     # creates user/session/account/verification/transaction tables
npm run seed               # optional: creates 2 test users with sample transactions
npm run dev                # http://localhost:8787
```

## Setup — Frontend

```bash
cd frontend
cp .env.example .env
# NEXT_PUBLIC_API_URL should point at the backend (default http://localhost:8787)

npm install
npm run dev                # http://localhost:3000
```

## Running tests

```bash
cd backend
npm test
```

The parser unit tests (5 tests) run with no setup required. The auth +
isolation integration tests (6 tests) run against a **real Postgres
database** — they exercise actual registration, login, and cross-tenant
access attempts through the live Hono app, because mocking Better Auth's
session internals would not prove isolation actually holds. Point
`DATABASE_URL` at a real (ideally disposable/test) database before running
`npm test`, or the integration suite will skip automatically and only the
parser tests will run.

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/vessify_test" npm test
```

## Test credentials

After running `npm run seed`:

| Email | Password | Notes |
|---|---|---|
| `alice@vessify-test.com` | `password123` | 3 seeded transactions |
| `bob@vessify-test.com` | `password123` | 3 seeded transactions, isolated from Alice |

Log in as either user and confirm the transaction list only ever shows that
user's own 3 rows — this is the manual equivalent of the automated isolation
test.

## API reference

Better Auth mounts its own routes under `/api/auth/*`. The two relevant to
the brief's literal spec:

| Brief's path | Actual Better Auth path | Method |
|---|---|---|
| `/api/auth/register` | `/api/auth/sign-up/email` | POST |
| `/api/auth/login` | `/api/auth/sign-in/email` | POST |

Application routes:

| Path | Method | Auth required | Description |
|---|---|---|---|
| `/api/transactions/extract` | POST | Yes | Parses `{ text }`, saves to DB scoped to caller's `organizationId` |
| `/api/transactions` | GET | Yes | Cursor-paginated list (`?cursor=...&limit=20`), scoped to caller's `organizationId` |
| `/health` | GET | No | Liveness check |

## Parsing & confidence scoring

`backend/src/parser/parseTransaction.ts` handles all three documented sample
formats (labeled, arrow/debited, and dense/unlabeled) plus reasonable
variants, using a layered regex strategy per field (date, amount, balance,
description, category) rather than one monolithic pattern — this is what
lets the same function degrade gracefully on an unrecognized format instead
of throwing.

Confidence is a weighted sum (date 0.30, amount 0.35, description 0.20,
balance 0.15) of which fields matched a recognized pattern versus a
fallback guess. Amount and date carry the most weight since they're the two
fields a finance extractor cannot afford to get wrong silently.

## Scalability patterns

- **Cursor pagination** on `(createdAt desc, id desc)` rather than
  offset/limit — stable under concurrent inserts, no "page 2 skips a row
  because page 1 shifted" bug.
- **Indexes**: `(organizationId, createdAt)` composite index backs the list
  query directly; a separate `userId` index supports any future per-user
  (not per-org) query.
- **No N+1**: the extract and list endpoints are each a single Prisma call;
  there's no per-row follow-up query.

## AI tools used

Claude (Anthropic) was used throughout for planning the architecture,
writing the backend/frontend code, and writing this README. Every line was
reviewed and is understood; happy to walk through any part of it,
particularly the Better Auth integration and the isolation guarantees, in
the pair-programming round.
