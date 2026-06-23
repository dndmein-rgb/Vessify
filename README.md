# Vessify — Personal Finance Transaction Extractor

A tenant-isolated transaction extractor built for the Vessify internship
assignment: paste raw bank statement text, get back structured,
confidence-scored data, saved per-user with true data isolation enforced at
every query.

**Stack:** Hono (TypeScript) · PostgreSQL (Neon) + Prisma 7 · Better Auth ·
Next.js 15 (App Router) · shadcn-style components + Tailwind CSS

---

## Table of contents

- [Architecture decisions](#architecture-decisions)
- [Repo layout](#repo-layout)
- [Local development setup](#local-development-setup)
- [Running tests](#running-tests)
- [Deploying as a single service (Render)](#deploying-as-a-single-service-render)
- [API reference](#api-reference)
- [Parsing & confidence scoring](#parsing--confidence-scoring)
- [Scalability patterns](#scalability-patterns)
- [Known gotchas (read before deploying)](#known-gotchas-read-before-deploying)
- [AI tools used](#ai-tools-used)

---

## Architecture decisions

### Why no Auth.js

The assignment brief specifies Better Auth on the backend **and** Auth.js
on the frontend, synced together via custom callbacks. In practice these
are two competing session systems solving the same problem. **This build
uses Better Auth end-to-end** — backend (`better-auth` + a Prisma driver
adapter) and frontend (`better-auth/react` client) — and does not use
Auth.js at all.

Better Auth already ships a first-class React/Next.js client
(`createAuthClient`) that manages session cookies, the `useSession` hook,
and sign-in/sign-up/sign-out, talking directly to the same Better Auth
instance running on the backend. Bolting Auth.js on top would mean
maintaining two independent auth/session implementations with no
isolation, security, or UX benefit — only more surface area for bugs (e.g.
cookie/session mismatches between the two systems). Given the evaluation
criteria explicitly reward *secure and correct* auth over checkbox
compliance with every named library, a single coherent system was the
better call.

### Multi-tenancy: `organizationId == userId`

The brief asks for organization/team-based isolation. Rather than pulling
in Better Auth's full `organization` plugin — which adds invites,
multi-member teams, and role management that nothing in this assignment's
actual flows exercises — tenancy here is simplified to
**`organizationId == userId`**. Every user is the sole member of their own
organization.

Every query that touches `Transaction` filters by `organizationId`,
sourced **only** from the authenticated session via the `requireAuth`
middleware — never from client input, not even as a fallback. This
satisfies the literal isolation requirement ("no way to see another user's
data even with modified requests") without unused complexity. See
`backend/src/__tests__/auth-isolation.test.ts` for the automated proof,
including a dedicated test that sends a forged `organizationId` in the
request body and confirms it's ignored.

Swapping in the real organization plugin later is a contained change: add
an `Organization` model, source `organizationId` from membership instead
of `user.id` inside the middleware, and the rest of the isolation logic —
every downstream query already filtering by `organizationId` — does not
change.

### Why Prisma 7 + a driver adapter (not the classic Prisma 5/6 setup)

Prisma 7 removed the Rust query engine binary, which means `PrismaClient`
no longer connects to the database on its own — it requires an explicit
driver adapter. This project uses `@prisma/adapter-pg` (wrapping
`node-postgres`) with a tuned connection pool:

```ts
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  min: 2,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 10000,
  application_name: "vessify-backend",
});
const adapter = new PrismaPg(pool);
```

The connection string itself lives in `prisma.config.ts`, not in
`schema.prisma` — Prisma 7 no longer supports a `url` property in the
`datasource` block. If you've previously worked with Prisma 5/6, this is
the single biggest structural difference to be aware of (see
[Known gotchas](#known-gotchas-read-before-deploying)).

---

## Repo layout

```
vessify/
├── backend/      Hono API, Prisma schema, Better Auth config, parser, tests
├── frontend/      Next.js App Router UI
├── package.json    Root orchestration: installs + builds + starts both as one service
```

The root `package.json` is what makes this deployable as a **single Render
service** rather than two separate hosted apps — see the deployment
section below.

---

## Local development setup

### Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` → your Neon connection string (include `?sslmode=require`;
  Neon includes this by default)
- `BETTER_AUTH_SECRET` → generate with `openssl rand -base64 32`

```bash
npm install
npm run prisma:generate
npm run prisma:migrate     # creates user/session/account/verification/jwks/transaction tables
npm run seed               # optional: creates 2 test users with sample transactions
npm run dev                # http://localhost:8787
```

> **Always use the `npm run prisma:*` scripts, never bare `npx prisma ...`.**
> If a different Prisma version is installed globally, `npx` can resolve
> that instead of the version pinned in this project's `package.json`. The
> `prisma:*` scripts call the local binary directly, sidestepping that.

### Frontend

```bash
cd frontend
cp .env.example .env
```

Leave `NEXT_PUBLIC_API_URL` **unset** for local dev too — the frontend
already falls back to same-origin requests, and `next.config.mjs`'s
`rewrites()` proxies `/api/*` to the backend on `localhost:8787`
automatically.

```bash
npm install
npm run dev                # http://localhost:3000
```

### Test credentials

After running `npm run seed`:

| Email | Password | Notes |
|---|---|---|
| `alice@vessify-test.com` | `password123` | 3 seeded transactions |
| `bob@vessify-test.com` | `password123` | 3 seeded transactions, isolated from Alice |

Log in as either user and confirm the transaction list only ever shows
that user's own 3 rows — this is the manual equivalent of the automated
isolation test.

---

## Running tests

```bash
cd backend
npm test
```

This runs:

```json
"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand"
```

> Invoking the real `.js` entrypoint directly (rather than
> `node_modules/.bin/jest`) is deliberate — `.bin/jest` is a Unix shell
> script on some platforms and a `.cmd`/`.ps1` shim on Windows; pointing
> `node` straight at it can fail with a confusing syntax error on Windows.
> Calling the actual `jest.js` file sidesteps the platform difference
> entirely, since `node` runs `.js` files identically everywhere.

- **5 parser unit tests** run with no setup required, on any platform,
  including CI with no database attached.
- **6 auth + isolation integration tests** run against a **real Postgres
  database** — they exercise actual registration, login, and cross-tenant
  access attempts through the live Hono app, because mocking Better Auth's
  session internals would not prove isolation actually holds. If
  `DATABASE_URL` isn't set to a real reachable database, this suite
  **skips automatically** rather than failing, so `npm test` still works
  in any environment.

```bash
DATABASE_URL="postgresql://user:pass@ep-xxx.neon.tech/vessify?sslmode=require" npm test
```

---

## Deploying as a single service (Render)

This project deploys as **one Render web service** running both the
backend and frontend as sibling processes, rather than two separately
hosted apps. The frontend is the only public-facing process; the backend
listens on an internal-only port that the frontend proxies to.

### How it works

The root `package.json` orchestrates everything:

```json
{
  "scripts": {
    "build": "npm install --prefix backend && npm install --prefix frontend --include=dev && npm run build --prefix backend && npm run build --prefix frontend",
    "start": "npx concurrently -k -s first \"npx cross-env PORT=8787 npm run start:backend\" \"npx cross-env PORT=$PORT npm run start:frontend\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2",
    "cross-env": "^7.0.3"
  }
}
```

- **`build`** installs and builds *both* apps — `npm run build --prefix
  backend` (Prisma generate + `tsc`) must run before the frontend build,
  or `backend/dist/index.js` won't exist when the service tries to start.
- **`start`** uses `concurrently` to run both processes, with `cross-env`
  pinning each process's `PORT` explicitly: the backend always gets
  `8787` (internal-only, never exposed), the frontend gets Render's real
  injected `$PORT` (the actual public port). `-k -s first` means if either
  process dies, the other is killed too — a half-running deployment is
  treated as a failed one.
- The frontend's `next.config.mjs` proxies `/api/*` to
  `http://localhost:8787/api/*` via `rewrites()`, so the browser only
  ever talks to one public origin. This also means cookies are same-origin
  first-party cookies, sidestepping a whole class of cross-site cookie
  policy issues.

### Render setup steps

1. New → **Web Service** → connect your repo.
2. Build command: `npm run build` (root). Start command: `npm run start`
   (root). Root directory: leave as the repo root, not `frontend/` or
   `backend/`.
3. Add environment variables (see table below).
4. Deploy. Run migrations once, either from your own machine pointed at
   the same Neon `DATABASE_URL`, or via Render's shell:
   ```bash
   npm run prisma:migrate --prefix backend
   ```

### Required environment variables

| Variable | Set it? | Notes |
|---|---|---|
| `DATABASE_URL` | **Yes, set explicitly** | Neon connection string with `?sslmode=require` |
| `BETTER_AUTH_SECRET` | **Yes, set explicitly** | `openssl rand -base64 32` output |
| `BETTER_AUTH_URL` | **No — leave unset** | Auto-derived from Render's injected `RENDER_EXTERNAL_URL`. See gotcha #2 below. |
| `FRONTEND_URL` | **No — leave unset** | Same as above. |
| `NEXT_PUBLIC_API_URL` | **No — leave unset** | See gotcha #1 below. |
| `PORT` | **No — never set manually** | Render injects this automatically. |

---

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

The `jwt` plugin is also enabled, exposing a token endpoint for any
non-browser client (curl testing, future mobile app) in addition to the
cookie-based session the frontend actually uses. It requires the `Jwks`
model in `schema.prisma` to store signing key pairs — already included.

---

## Parsing & confidence scoring

`backend/src/parser/parseTransaction.ts` handles all three documented
sample formats (labeled, arrow/debited, and dense/unlabeled) plus
reasonable variants, using a layered regex strategy per field (date,
amount, balance, description, category) rather than one monolithic
pattern — this is what lets the same function degrade gracefully on an
unrecognized format instead of throwing.

Confidence is a weighted sum (date 0.30, amount 0.35, description 0.20,
balance 0.15) of which fields matched a recognized pattern versus a
fallback guess. Amount and date carry the most weight since they're the
two fields a finance extractor cannot afford to get wrong silently.

---

## Scalability patterns

- **Cursor pagination** on `(createdAt desc, id desc)` rather than
  offset/limit — stable under concurrent inserts, no "page 2 skips a row
  because page 1 shifted" bug.
- **Indexes**: `(organizationId, createdAt)` composite index backs the
  list query directly; a separate `userId` index supports any future
  per-user (not per-org) query.
- **No N+1**: the extract and list endpoints are each a single Prisma
  call; there's no per-row follow-up query.
- **Connection pooling**: a tuned `pg.Pool` (max 20, min 2) sits behind
  the Prisma adapter rather than relying on Prisma's old built-in engine
  pooling, since that no longer exists in Prisma 7.

---

## Known gotchas (read before deploying)

These are real bugs hit and fixed during development — documented so they
don't get re-introduced.

### 1. `NEXT_PUBLIC_API_URL` must stay unset in production

`NEXT_PUBLIC_*` variables are inlined into the JavaScript bundle at
**build time**, not read at runtime. Setting this to an absolute URL like
`http://localhost:8787` bakes a browser-unreachable hostname directly into
the compiled bundle — the browser, running on the visitor's machine, has
no idea what `localhost:8787` means. The frontend's API/auth clients
already default to same-origin relative paths when this variable is
absent; leave it absent.

### 2. `BETTER_AUTH_URL` / `FRONTEND_URL` must stay unset too

`backend/src/lib/env.ts` auto-populates both from Render's injected
`RENDER_EXTERNAL_URL` — but **only if they aren't already set**:
```ts
if (defaultUrl) {
  if (!process.env.BETTER_AUTH_URL) process.env.BETTER_AUTH_URL = defaultUrl;
  if (!process.env.FRONTEND_URL) process.env.FRONTEND_URL = defaultUrl;
}
```
An explicit stale value (e.g. a leftover `http://localhost:3000` from
local dev) always wins over the correct auto-detected one, since the
fallback only fires when the variable is absent. Better Auth's
`trustedOrigins` check then rejects every real request with a `403`,
because the configured trusted origin doesn't match where requests
actually come from. Delete these variables from Render's dashboard
entirely rather than editing them — don't replace them with the right
value manually, just remove them.

### 3. `tsc` build order matters in the root build script

The root `build` script must run `npm run build --prefix backend` **before**
`npm run build --prefix frontend`. Backend's build step compiles
`dist/index.js`, which the start script needs; skipping it (or only
building the frontend) produces a `MODULE_NOT_FOUND` error on startup that
can look unrelated to the actual cause.

### 4. `app/icon.png` is a special App Router convention, not a plain static file

Anything named `icon.png`, `favicon.ico`, or `apple-icon.png` placed
directly in `app/` is intercepted by Next.js and routed through its
metadata image pipeline — not served as-is. A malformed or corrupted file
there can break static generation for `/404` and `/_error` with a
misleading `<Html> should not be imported outside of pages/_document`
error that has nothing to do with any actual `Html` import in this
codebase. Icons live in `public/icon.png` instead, referenced explicitly
via `metadata.icons` in `app/layout.tsx`.

### 5. A non-standard `NODE_ENV` value can also trigger the same `<Html>` error

If `NODE_ENV` is set to anything Next.js doesn't expect (not exactly
`development`, `production`, or `test`) — including via a stray value
inherited from a parent process or a misconfigured platform env var — the
build's internal page-generation path can break in the same misleading
way as gotcha #4. Don't set `NODE_ENV` manually in Render's dashboard;
Render and the npm scripts already set it correctly on their own.

### 6. Windows shell syntax breaks silently in npm scripts

`VAR=value command` (bash/POSIX syntax) is not valid in PowerShell or
cmd.exe. Any script meant to run identically on Windows and Linux should
use `cross-env` rather than inline variable assignment, and should point
directly at a tool's real `.js` entrypoint rather than a `node_modules/.bin/`
shim, since those shims differ in format across platforms.

---

## AI tools used

Claude (Anthropic) was used throughout for planning the architecture,
writing the backend/frontend code, debugging the deployment, and writing
this README. Every decision — the Auth.js deviation, the simplified
tenancy model, the Prisma 7 migration, each deployment fix — was reviewed
and is understood, and the reasoning behind each is documented above.
