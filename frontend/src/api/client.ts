const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function get<T>(url: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      Accept: "application/json",
    },
  });

  const contentType = response.headers.get("content-type");
  const isJsonResponse = contentType?.includes("application/json") ?? false;
  const payload = isJsonResponse ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
