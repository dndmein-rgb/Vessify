import type { Transaction } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number) {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : "+"}₹${formatted}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tier = confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low";
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        tier === "high" && "bg-credit/10 text-credit",
        tier === "medium" && "bg-accent-light/10 text-accent-light",
        tier === "low" && "bg-debit/10 text-debit",
      )}
    >
      {pct}%
    </span>
  );
}

export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-text-secondary">No transactions yet.</p>
        <p className="mt-1 text-xs text-text-muted">
          Paste a statement line above and click &ldquo;Parse &amp; Save&rdquo; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-muted">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Description</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium text-right">Amount</th>
            <th className="px-4 py-3 font-medium text-right">Balance</th>
            <th className="px-4 py-3 font-medium text-right">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-surfaceHover">
              <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatDate(t.date)}</td>
              <td className="px-4 py-3 text-text-primary">{t.description}</td>
              <td className="px-4 py-3 text-text-secondary">
                {t.category ? (
                  <span className="rounded-full bg-surfaceHover px-2 py-0.5 text-xs">{t.category}</span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-right font-mono",
                  t.amount < 0 ? "text-debit" : "text-credit",
                )}
              >
                {formatCurrency(t.amount)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-text-secondary">
                {t.balanceAfter !== null ? `₹${t.balanceAfter.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <ConfidenceBadge confidence={t.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
