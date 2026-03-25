const DEFAULT_API_BASE = "https://qnsoy3nza1.execute-api.ap-southeast-2.amazonaws.com/prod";

export const API_BASE = (import.meta.env.VITE_GUARDIAN_API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");

export type ApiDecision = "APPROVE" | "RISKED" | "FREEZE";

type EventReviewUpdateRequest = {
  eventId: string;
  decision: ApiDecision;
  backendDecision?: ApiDecision;
  reviewSource?: string;
};

type ApiErrorPayload = {
  error?: string;
};

function safeParseJson(value: string) {
  if (!value.trim()) return {};
  return JSON.parse(value);
}

export function normalizeApiDecision(decision: unknown): ApiDecision {
  switch (String(decision || "").toUpperCase()) {
    case "APPROVE":
    case "APPROVED":
      return "APPROVE";
    case "FREEZE":
    case "BLOCKED":
      return "FREEZE";
    case "RISKED":
    case "FLAG":
      return "RISKED";
    default:
      return "APPROVE";
  }
}

export async function parseApiPayload<T>(response: Response): Promise<T> {
  const rawText = await response.text();

  let rawPayload: unknown = {};
  if (rawText.trim()) {
    try {
      rawPayload = safeParseJson(rawText);
    } catch {
      throw new Error(`Invalid JSON response (HTTP ${response.status})`);
    }
  }

  let payload: unknown = rawPayload;
  if (rawPayload && typeof rawPayload === "object" && "body" in rawPayload) {
    const nestedBody = (rawPayload as { body?: unknown }).body;
    if (typeof nestedBody === "string") {
      try {
        payload = safeParseJson(nestedBody);
      } catch {
        throw new Error(`Invalid nested JSON response (HTTP ${response.status})`);
      }
    } else if (nestedBody !== undefined) {
      payload = nestedBody;
    }
  }

  if (!response.ok) {
    const errorMessage =
      (payload as ApiErrorPayload)?.error ||
      (rawPayload as ApiErrorPayload)?.error ||
      `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export function formatUsd(value: number | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

export async function updateEventReviewDecision({
  eventId,
  decision,
  backendDecision,
  reviewSource = "MANUAL_REVIEW",
}: EventReviewUpdateRequest): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/events`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: eventId,
      decision,
      review_decision: decision,
      backend_decision: backendDecision,
      review_source: reviewSource,
      review_updated_at: new Date().toISOString(),
    }),
  });

  return parseApiPayload<Record<string, unknown>>(response);
}
