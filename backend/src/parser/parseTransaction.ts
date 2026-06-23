export interface ParsedTransaction {
  description: string;
  amount: number; // negative = debit, positive = credit
  date: Date;
  balanceAfter: number | null;
  category: string | null;
  confidence: number; // 0..1
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDDMonYYYY(text: string): Date | null {
  // "11 Dec 2025"
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
  if (!m) return null;
  const [, dayStr, monStr, yearStr] = m;
  if (!dayStr || !monStr || !yearStr) return null;

  const day = parseInt(dayStr, 10);
  const monKey = monStr.slice(0, 3).toLowerCase();
  const month = MONTHS[monKey];
  const year = parseInt(yearStr, 10);
  if (month === undefined) return null;

  const d = new Date(Date.UTC(year, month, day));
  return isNaN(d.getTime()) ? null : d;
}

function parseSlashDate(text: string): Date | null {
  // "12/11/2025" — DD/MM/YYYY (Indian convention, matches sample context)
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, dayStr, monStr, yearStr] = m;
  if (!dayStr || !monStr || !yearStr) return null;

  const day = parseInt(dayStr, 10);
  const month = parseInt(monStr, 10) - 1;
  const year = parseInt(yearStr, 10);

  const d = new Date(Date.UTC(year, month, day));
  return isNaN(d.getTime()) ? null : d;
}

function parseISODate(text: string): Date | null {
  // "2025-12-10"
  const m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, yearStr, monStr, dayStr] = m;
  if (!yearStr || !monStr || !dayStr) return null;

  const d = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monStr, 10) - 1, parseInt(dayStr, 10)));
  return isNaN(d.getTime()) ? null : d;
}

function extractDate(text: string): { date: Date | null; confidenceHit: boolean } {
  const iso = parseISODate(text);
  if (iso) return { date: iso, confidenceHit: true };
  const ddmon = parseDDMonYYYY(text);
  if (ddmon) return { date: ddmon, confidenceHit: true };
  const slash = parseSlashDate(text);
  if (slash) return { date: slash, confidenceHit: true };
  return { date: null, confidenceHit: false };
}

function toNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[₹,\s]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

function extractAmount(text: string): { amount: number | null; isDebit: boolean; confidenceHit: boolean } {
  // Look for explicit signed amount first: "Amount: -420.00"
  const signedLabeled = text.match(/Amount:\s*(-?₹?\s*[\d,]+(?:\.\d+)?)/i);
  const signedVal = toNumber(signedLabeled?.[1]);
  if (signedVal !== null) {
    return { amount: Math.abs(signedVal), isDebit: signedVal < 0, confidenceHit: true };
  }

  // "₹1,250.00 debited" / "₹2,999.00 Dr"
  const debitMatch = text.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:debited|Dr\b)/i);
  const debitVal = toNumber(debitMatch?.[1]);
  if (debitVal !== null) {
    return { amount: debitVal, isDebit: true, confidenceHit: true };
  }

  // "₹1,250.00 credited" / "Cr"
  const creditMatch = text.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:credited|Cr\b)/i);
  const creditVal = toNumber(creditMatch?.[1]);
  if (creditVal !== null) {
    return { amount: creditVal, isDebit: false, confidenceHit: true };
  }

  // Fallback: any ₹ amount in text (lower confidence, assume debit since
  // these are spend-tracking statements)
  const anyRupee = text.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  const anyVal = toNumber(anyRupee?.[1]);
  if (anyVal !== null) {
    return { amount: anyVal, isDebit: true, confidenceHit: false };
  }

  return { amount: null, isDebit: true, confidenceHit: false };
}

function extractBalance(text: string): { balance: number | null; confidenceHit: boolean } {
  const labeled = text.match(
    /(?:Balance after transaction|Available Balance|Bal)\s*:?\s*→?\s*₹?\s*([\d,]+(?:\.\d+)?)/i,
  );
  const val = toNumber(labeled?.[1]);
  if (val !== null) return { balance: val, confidenceHit: true };
  return { balance: null, confidenceHit: false };
}

function extractDescription(text: string): { description: string; confidenceHit: boolean } {
  const labeled = text.match(/Description:\s*(.+)/i);
  const labeledDesc = labeled?.[1]?.trim();
  if (labeledDesc) {
    return { description: labeledDesc, confidenceHit: true };
  }

  // Try to grab a merchant-like token sequence: words/numbers before a
  // date or amount marker. Heuristic for unlabeled formats (samples 2 & 3).
  const firstLine = (text.split("\n")[0] ?? "").trim();

  // Strip leading txn ids like "txn123"
  const withoutTxnId = firstLine.replace(/^txn\w*\d*\s*/i, "");

  // Strip trailing date patterns and everything after the amount marker
  const cutAtDate = withoutTxnId
    .replace(/\d{4}-\d{2}-\d{2}.*$/, "")
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}.*$/, "")
    .trim();

  if (cutAtDate.length > 0) {
    return { description: cutAtDate, confidenceHit: true };
  }

  return { description: text.slice(0, 60).trim() || "Unknown transaction", confidenceHit: false };
}

function extractCategory(text: string): string | null {
  const known = ["Shopping", "Food", "Travel", "Transport", "Groceries", "Entertainment", "Bills", "Coffee"];
  for (const cat of known) {
    if (new RegExp(`\\b${cat}\\b`, "i").test(text)) return cat;
  }
  if (/starbucks|coffee|cafe/i.test(text)) return "Coffee";
  if (/uber|ola|taxi|cab/i.test(text)) return "Transport";
  if (/amazon|flipkart|myntra/i.test(text)) return "Shopping";
  return null;
}

/**
 * Parses a raw bank-statement snippet into a structured transaction.
 * Designed to handle the three documented sample formats (labeled,
 * arrow-style, and dense/unlabeled) plus reasonable variants, while
 * degrading gracefully (lower confidence, never throwing) on unknown
 * formats.
 */
export function parseTransactionText(text: string): ParsedTransaction {
  const cleaned = text.trim();

  const { date, confidenceHit: dateHit } = extractDate(cleaned);
  const { amount: rawAmount, isDebit, confidenceHit: amountHit } = extractAmount(cleaned);
  const { balance, confidenceHit: balanceHit } = extractBalance(cleaned);
  const { description, confidenceHit: descHit } = extractDescription(cleaned);
  const category = extractCategory(cleaned);

  const signedAmount = rawAmount === null ? 0 : isDebit ? -Math.abs(rawAmount) : Math.abs(rawAmount);

  // Confidence: weighted sum of which fields were extracted with a
  // recognized pattern vs. fallback/guessed. Amount + date matter most
  // for a finance extractor, so they carry the largest weights.
  const weighted: Array<[boolean, number]> = [
    [dateHit, 0.3],
    [amountHit, 0.35],
    [descHit, 0.2],
    [balanceHit, 0.15],
  ];
  const confidenceRaw = weighted.reduce((sum, [hit, weight]) => sum + (hit ? weight : 0), 0);
  const confidence = Math.round(confidenceRaw * 100) / 100;

  return {
    description: description || "Unknown transaction",
    amount: signedAmount,
    date: date ?? new Date(),
    balanceAfter: balance,
    category,
    confidence,
  };
}
