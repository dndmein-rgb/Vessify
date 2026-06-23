"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "@/lib/auth-client";
import { extractTransaction, listTransactions, type Transaction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TransactionTable } from "@/components/transaction-table";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const hasLoaded = useRef(false);

  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ confidence: number; description: string } | null>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Protect this page: redirect to /login if there's no session.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session || hasLoaded.current) return;

    hasLoaded.current = true;

    const loadInitial = async () => {
      setLoadingList(true);
      try {
        const res = await listTransactions(null);
        setTransactions(res.transactions);
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } finally {
        setLoadingList(false);
      }
    };

    loadInitial();
  }, [session]);

  async function handleLoadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await listTransactions(cursor);
      setTransactions((prev) => [...prev, ...res.transactions]);
      setCursor(res.nextCursor);
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleExtract() {
    if (!text.trim()) return;
    setExtracting(true);
    setExtractError(null);
    setFeedback(null);
    try {
      const res = await extractTransaction(text);
      setFeedback({ confidence: res.confidence, description: res.transaction.description });
      setText("");
      // Reload transactions after extract
      setLoadingList(true);
      try {
        const result = await listTransactions(null);
        setTransactions(result.transactions);
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      } finally {
        setLoadingList(false);
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Failed to parse transaction");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  if (isPending || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent-light" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white">
              V
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Vessify</p>
              <p className="text-xs text-text-muted">{session.user.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleSignOut}>
            Sign out
          </Button>
        </header>

        <Card className="mb-6 p-5">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Extract a transaction</h2>
          <p className="mb-4 text-xs text-text-secondary">
            Paste raw bank statement text below — any of the supported formats work.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Date: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18,420.50"}
            rows={5}
            className="w-full resize-none rounded-md border border-border bg-background px-3.5 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-light focus:outline-none focus:ring-1 focus:ring-accent-light/40"
          />

          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs">
              {extractError && <span className="text-debit">{extractError}</span>}
              {feedback && !extractError && (
                <span className="text-credit">
                  Saved &ldquo;{feedback.description}&rdquo; — {Math.round(feedback.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <Button onClick={handleExtract} loading={extracting} disabled={!text.trim()}>
              Parse &amp; Save
            </Button>
          </div>
        </Card>

        <Card>
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-text-primary">Your transactions</h2>
          </div>

          {loadingList ? (
            <div className="flex justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent-light" />
            </div>
          ) : (
            <>
              <TransactionTable transactions={transactions} />
              {hasMore && (
                <div className="flex justify-center border-t border-border px-5 py-4">
                  <Button variant="secondary" onClick={handleLoadMore} loading={loadingMore}>
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
