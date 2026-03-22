import { ApiError } from "./types";

export class ApiClientError extends Error {
  status: number;
  detail: ApiError;

  constructor(status: number, detail: ApiError) {
    super(detail.message);
    this.status = status;
    this.detail = detail;
  }
}

function extractErrorDetail(payload: { detail?: ApiError | string } | null, fallback: string): ApiError {
  return payload && typeof payload.detail === "object"
    ? payload.detail
    : { code: "request_failed", message: String(payload?.detail ?? fallback) };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: ApiError | string }
      | null;
    throw new ApiClientError(response.status, extractErrorDetail(payload, response.statusText));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function requestErrorDetail(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => null)) as
    | { detail?: ApiError | string }
    | null;
  return extractErrorDetail(payload, response.statusText);
}
