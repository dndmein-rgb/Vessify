/**
 * These tests exercise the real Hono app + Better Auth + Postgres, because
 * mocking Better Auth's session/cookie internals would not actually prove
 * isolation works — the whole point of these tests is to catch a forged
 * request or a missing `where: { organizationId }` clause. They require a
 * running Postgres reachable via DATABASE_URL, with `npx prisma generate`
 * and `npx prisma migrate deploy` already run against it (see README
 * "Running tests").
 *
 * If DATABASE_URL is not configured for a real database, this entire suite
 * is skipped (not failed) so `npm test` still runs the parser unit tests in
 * any environment. The app/prisma modules are imported dynamically inside
 * the gated block below — NOT as static top-level imports — because a
 * static import of `../index.js` pulls in the generated Prisma client at
 * module-evaluation time, before any skip logic could run. That import
 * would throw in any environment where `prisma generate` hasn't been run
 * against a real database, defeating the purpose of the skip guard.
 */

const hasRealDb =
  !!process.env.DATABASE_URL &&
  process.env.DATABASE_URL !== "postgresql://test:test@localhost:5432/test";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@vessify-test.com`;
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  return setCookie.split(";")[0] ?? "";
}

interface ExtractResponseBody {
  transaction: { amount: number; organizationId: string; userId: string };
  confidence: number;
}

interface ListResponseBody {
  transactions: Array<{ description: string }>;
}

const describeIfDb = hasRealDb ? describe : describe.skip;

describeIfDb("Auth + isolation integration", () => {
  // Lazily resolved inside beforeAll, only when this suite actually runs.
  let app: typeof import("../index.js")["app"];
  let prisma: typeof import("../lib/prisma.js")["prisma"];

  beforeAll(async () => {
    const indexModule = await import("../index.js");
    const prismaModule = await import("../lib/prisma.js");
    app = indexModule.app;
    prisma = prismaModule.prisma;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { rawText: { contains: "vessify-test-marker" } } });
    await prisma.$disconnect();
  });

  async function signUp(email: string, password: string, name: string) {
    return app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
  }

  it("registers a new user with a hashed password (POST /api/auth/sign-up/email)", async () => {
    const email = uniqueEmail("register");
    const res = await signUp(email, "password123", "Test User");
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();

    const account = await prisma.account.findFirst({ where: { userId: user!.id } });
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toBe("password123"); // must be hashed, not plaintext
  });

  it("logs in and returns a session cookie (POST /api/auth/sign-in/email)", async () => {
    const email = uniqueEmail("login");
    await signUp(email, "password123", "Login User");

    const res = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("rejects requests to protected routes without a valid session (401)", async () => {
    const res = await app.request("/api/transactions", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("extracts and saves a transaction for an authenticated user", async () => {
    const email = uniqueEmail("extract");
    await signUp(email, "password123", "Extract User");
    const loginRes = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    const cookie = extractCookie(loginRes);

    const res = await app.request("/api/transactions/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        text: "Date: 11 Dec 2025\nDescription: vessify-test-marker COFFEE\nAmount: -100.00\nBalance after transaction: 500.00",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ExtractResponseBody;
    expect(body.transaction.amount).toBe(-100);
    expect(body.confidence).toBeGreaterThan(0);
  });

  it("enforces true data isolation: user B cannot see user A's transactions even via GET /api/transactions", async () => {
    const emailA = uniqueEmail("isoA");
    const emailB = uniqueEmail("isoB");

    await signUp(emailA, "password123", "User A");
    await signUp(emailB, "password123", "User B");

    const loginA = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password: "password123" }),
    });
    const cookieA = extractCookie(loginA);

    const loginB = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailB, password: "password123" }),
    });
    const cookieB = extractCookie(loginB);

    // User A creates a transaction
    await app.request("/api/transactions/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA },
      body: JSON.stringify({
        text: "Date: 11 Dec 2025\nDescription: vessify-test-marker SECRET A\nAmount: -999.00\nBalance after transaction: 1.00",
      }),
    });

    // User B lists transactions — must NOT see User A's data
    const listB = await app.request("/api/transactions", {
      method: "GET",
      headers: { Cookie: cookieB },
    });
    const bodyB = (await listB.json()) as ListResponseBody;

    const leaked = bodyB.transactions.some((t) =>
      t.description.includes("vessify-test-marker SECRET A"),
    );
    expect(leaked).toBe(false);
  });

  it("rejects an attempt to forge organizationId by passing it in the request body", async () => {
    const emailA = uniqueEmail("forgeA");
    await signUp(emailA, "password123", "Forge User");
    const loginA = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailA, password: "password123" }),
    });
    const cookieA = extractCookie(loginA);

    // Attempt to smuggle a different organizationId in the body — the
    // route schema doesn't even accept this field, and the server always
    // derives organizationId from the session, so this must be ignored.
    const res = await app.request("/api/transactions/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieA },
      body: JSON.stringify({
        text: "Date: 11 Dec 2025\nDescription: vessify-test-marker FORGE\nAmount: -50.00",
        organizationId: "some-other-org-id",
        userId: "some-other-user-id",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as ExtractResponseBody;
    expect(body.transaction.organizationId).not.toBe("some-other-org-id");
    expect(body.transaction.userId).not.toBe("some-other-user-id");
  });
});
