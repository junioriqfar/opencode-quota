let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  body?: BodyInit;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, headers, body, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();
  const requestHeaders = new Headers(headers);
  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD" && csrfToken) {
    requestHeaders.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(path, {
    ...rest,
    method,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : body,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let payload: { error?: string; message?: string; details?: unknown } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // ignore
    }
    throw new ApiError(
      response.status,
      payload.error ?? "request_failed",
      payload.message ?? `Request failed (${response.status}).`,
      payload.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function get<T>(path: string): Promise<T> {
  return api<T>(path);
}

export function post<T>(path: string, json?: unknown): Promise<T> {
  return api<T>(path, { method: "POST", json });
}

export function put<T>(path: string, json?: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", json });
}

export function del<T>(path: string, json?: unknown): Promise<T> {
  return api<T>(path, { method: "DELETE", json });
}

export function patch<T>(path: string, json?: unknown): Promise<T> {
  return api<T>(path, { method: "PATCH", json });
}
