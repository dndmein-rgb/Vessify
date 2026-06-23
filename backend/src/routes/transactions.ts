import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedVariables } from "../lib/middleware.js";
import { parseTransactionText } from "../parser/parseTransaction.js";

export const transactionRoutes = new Hono<{ Variables: AuthedVariables }>();

transactionRoutes.use("*", requireAuth);

const extractBodySchema = z.object({
  text: z.string().min(1, "text must not be empty").max(5000, "text too long"),
});

transactionRoutes.post("/extract", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = extractBodySchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const userId = c.get("userId");
  const organizationId = c.get("organizationId");

  const result = parseTransactionText(parsed.data.text);

  const saved = await prisma.transaction.create({
    data: {
      userId,
      organizationId,
      description: result.description,
      amount: result.amount,
      date: result.date,
      balanceAfter: result.balanceAfter,
      category: result.category,
      confidence: result.confidence,
      rawText: parsed.data.text,
    },
  });

  return c.json(
    {
      transaction: saved,
      confidence: result.confidence,
    },
    201,
  );
});

const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
});

transactionRoutes.get("/", async (c) => {
  const organizationId = c.get("organizationId");
  const queryParsed = listQuerySchema.safeParse({
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit"),
  });

  if (!queryParsed.success) {
    return c.json({ error: "Invalid query params", details: queryParsed.error.flatten() }, 400);
  }

  const { cursor, limit } = queryParsed.data;

  // Cursor-based pagination over (createdAt, id) — stable even when
  // multiple rows share a createdAt timestamp, and avoids the
  // "page N drifts as new rows are inserted" problem of offset pagination.
  const transactions = await prisma.transaction.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
  });

  const hasMore = transactions.length > limit;
  const page = hasMore ? transactions.slice(0, limit) : transactions;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  return c.json({
    transactions: page,
    nextCursor,
    hasMore,
  });
});
