const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

/** Parse a server cooldown without scheduling an automatic retry. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) {
    const milliseconds = Number(value) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  if (/^[+-]?\d/.test(value.trim())) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : null;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  retryAfterMs: number | null;

  constructor(
    message: string,
    status: number,
    payload: unknown,
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function get<T>(url: string, options: { signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    signal: options.signal,
    headers: {
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type");
  const isJsonResponse = contentType?.includes("application/json") ?? false;
  const payload = isJsonResponse ? await response.json() : await response.text();

  if (!response.ok) {
    let message =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${response.status}`;

    if (
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      Array.isArray(payload.detail)
    ) {
      const details = payload.detail.flatMap((item: unknown) => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("msg" in item) ||
          typeof item.msg !== "string"
        )
          return [];
        const location =
          "loc" in item && Array.isArray(item.loc) ? item.loc.slice(1).join(".") : "";
        return [`${location ? `${location}: ` : ""}${item.msg}`];
      });
      if (details.length) message = details.join("; ");
    }

    throw new ApiError(
      message,
      response.status,
      payload,
      parseRetryAfter(response.headers.get("Retry-After")),
    );
  }

  return payload as T;
}
