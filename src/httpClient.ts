import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Shape of the options supported by the shared HTTP helper.
 */
interface RequestOptions extends RequestInit {
  /**
   * Allows unauthenticated requests when true.
   */
  skipAuth?: boolean;
}

/**
 * Builds an absolute URL for the Recall API while enforcing leading slashes.
 * @param path - Request path beginning with `/`.
 * @returns Fully qualified URL.
 */
function buildUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`Path must start with '/': ${path}`);
  }
  return `${config.baseUrl}${path}`;
}

/**
 * Performs a JSON-friendly fetch call with consistent error handling.
 * @param path - Endpoint path.
 * @param init - Request options such as headers or method overrides.
 * @returns Parsed payload typed as {@link T}.
 */
async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path);
  const headers = new Headers(init.headers || {});
  if (!init.skipAuth) {
    headers.set("Authorization", `Bearer ${config.recallApiKey}`);
  }
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type");
  let payload: unknown = null;
  if (contentType && contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    logger.error(
      {
        url,
        method: init.method ?? "GET",
        status: response.status,
        statusText: response.statusText,
        body: payload,
      },
      "HTTP request failed",
    );
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: ${errorMessage}`,
    );
  }

  logger.debug(
    { url, method: init.method ?? "GET", status: response.status },
    "HTTP request succeeded",
  );
  return payload as T;
}

/**
 * Issues a GET request and returns parsed JSON.
 * @param path - Endpoint path beginning with `/`.
 * @param options - Optional fetch overrides.
 * @returns Parsed payload typed as {@link T}.
 */
export function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, { ...options, method: "GET" });
}

/**
 * Issues a POST request with a JSON body and returns parsed JSON.
 * @param path - Endpoint path beginning with `/`.
 * @param body - Serializable payload sent to the API.
 * @param options - Optional fetch overrides.
 * @returns Parsed payload typed as {@link T}.
 */
export function postJson<T>(
  path: string,
  body: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
  });
}
