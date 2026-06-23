import { parseTransactionText } from "../parser/parseTransaction.js";

describe("parseTransactionText", () => {
  it("parses Sample 1 (labeled format) correctly", () => {
    const text = `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`;

    const result = parseTransactionText(text);

    expect(result.description).toBe("STARBUCKS COFFEE MUMBAI");
    expect(result.amount).toBe(-420);
    expect(result.balanceAfter).toBe(18420.5);
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.date.getUTCMonth()).toBe(11); // December
    expect(result.date.getUTCDate()).toBe(11);
    expect(result.category).toBe("Coffee");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("parses Sample 2 (arrow/debited format) correctly", () => {
    const text = `Uber Ride * Airport Drop
12/11/2025 → ₹1,250.00 debited
Available Balance → ₹17,170.50`;

    const result = parseTransactionText(text);

    expect(result.amount).toBe(-1250);
    expect(result.balanceAfter).toBe(17170.5);
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.date.getUTCMonth()).toBe(10); // November (DD/MM/YYYY)
    expect(result.date.getUTCDate()).toBe(12);
    expect(result.category).toBe("Transport");
    expect(result.description.toLowerCase()).toContain("uber");
  });

  it("parses Sample 3 (messy/dense format) correctly", () => {
    const text = `txn123 2025-12-10 Amazon.in Order #403-1234567-8901234 ₹2,999.00 Dr Bal 14171.50 Shopping`;

    const result = parseTransactionText(text);

    expect(result.amount).toBe(-2999);
    expect(result.balanceAfter).toBe(14171.5);
    expect(result.date.getUTCFullYear()).toBe(2025);
    expect(result.date.getUTCMonth()).toBe(11); // December
    expect(result.date.getUTCDate()).toBe(10);
    expect(result.category).toBe("Shopping");
  });

  it("degrades gracefully on unrecognized text instead of throwing", () => {
    const text = "this is not a bank statement at all";
    expect(() => parseTransactionText(text)).not.toThrow();

    const result = parseTransactionText(text);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.amount).toBe(0);
  });

  it("produces a lower confidence score when fewer fields are recognized", () => {
    const fullText = `Date: 11 Dec 2025
Description: STARBUCKS COFFEE MUMBAI
Amount: -420.00
Balance after transaction: 18,420.50`;
    const partialText = "₹500 spent somewhere";

    const fullResult = parseTransactionText(fullText);
    const partialResult = parseTransactionText(partialText);

    expect(fullResult.confidence).toBeGreaterThan(partialResult.confidence);
  });
});
