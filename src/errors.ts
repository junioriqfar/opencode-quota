export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in.") =>
  new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, "conflict", message, details);
export const tooMany = (message = "Too many attempts. Please try again later.") =>
  new HttpError(429, "rate_limited", message);
