/**
 * Seeds two test users (each their own tenant) with sample transactions,
 * so graders can log in immediately without registering manually.
 *
 * Run with: npm run seed
 */
import "dotenv/config.js";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { parseTransactionText } from "../parser/parseTransaction.js";

const SAMPLE_TEXTS = [
  `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`,
  `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`,
  `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`,
];

async function ensureUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping creation.`);
    return existing;
  }

  await auth.api.signUpEmail({
    body: { email, password, name },
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  console.log(`Created user ${email} (id: ${user.id})`);
  return user;
}

async function seedTransactionsFor(userId: string) {
  for (const text of SAMPLE_TEXTS) {
    const parsed = parseTransactionText(text);
    await prisma.transaction.create({
      data: {
        userId,
        organizationId: userId,
        description: parsed.description,
        amount: parsed.amount,
        date: parsed.date,
        balanceAfter: parsed.balanceAfter,
        category: parsed.category,
        confidence: parsed.confidence,
        rawText: text,
      },
    });
  }
}

async function main() {
  console.log("Seeding test users...");

  const userA = await ensureUser("alice@vessify-test.com", "password123", "Alice Test");
  const userB = await ensureUser("bob@vessify-test.com", "password123", "Bob Test");

  await seedTransactionsFor(userA.id);
  await seedTransactionsFor(userB.id);

  console.log("\nDone. Test credentials:");
  console.log("  alice@vessify-test.com / password123");
  console.log("  bob@vessify-test.com / password123");
  console.log("\nEach user has 3 seeded transactions, scoped to their own organizationId.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
