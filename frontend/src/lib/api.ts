const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface Transaction {
  id: string;
  userId: string;
  organizationId: string;
  description: string;
  amount: number;
  date: string;
  balanceAfter: number | null;
  category: string | null;
  confidence: number;
  rawText: string;
  createdAt: string;
}

export interface ExtractResponse {
  transaction: Transaction;
  confidence: number;
}

export interface ListResponse {
  transactions: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.error ?? "Request failed", res.status);
  }

  return res.json() as Promise<T>;
}

export function extractTransaction(text: string): Promise<ExtractResponse> {
  return apiFetch<ExtractResponse>("/api/transactions/extract", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function listTransactions(cursor?: string | null, limit = 20): Promise<ListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return apiFetch<ListResponse>(`/api/transactions?${params.toString()}`);
}

export { ApiError };
