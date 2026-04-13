const DEFAULT_API_BASE =
  "https://r3izz4ipwosvopk43nsq2r4ovy0iyquk.lambda-url.ap-southeast-2.on.aws/";

export const API_BASE = (
  import.meta.env.VITE_GUARDIAN_API_BASE || DEFAULT_API_BASE
).replace(/\/$/, "");

export type ApiDecision = "APPROVE" | "RISKED" | "FREEZE";

export type GuardianEvent = {
  event_id: string;
  timestamp?: string;
  decision?: ApiDecision | string;
  review_decision?: ApiDecision | string;
  backend_decision?: ApiDecision | string;
  review_source?: string;
  review_updated_at?: string;
  [key: string]: unknown;
};

export type ModelFile = {
  key: string;
  size: number;
  last_modified: string;
};

export type ModelsResponse = {
  bucket: string;
  prefix: string;
  files: ModelFile[];
};

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

export async function getHealth(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/health`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  return parseApiPayload<Record<string, unknown>>(response);
}

export async function getEvents(): Promise<GuardianEvent[]> {
  const response = await fetch(`${API_BASE}/events`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  return parseApiPayload<GuardianEvent[]>(response);
}

export async function getModels(): Promise<ModelsResponse> {
  const response = await fetch(`${API_BASE}/models`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  return parseApiPayload<ModelsResponse>(response);
}

export async function clearEvents(): Promise<{
  message: string;
  cleared: number;
}> {
  const response = await fetch(`${API_BASE}/events`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });

  return parseApiPayload<{ message: string; cleared: number }>(response);
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
