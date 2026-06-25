import pino from "pino";
import type { Config } from "./config.js";

const logger = pino({ transport: undefined }, process.stderr);

const BASE_URL = "https://api.appmetrica.yandex.ru";

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Tunables (env-overridable). Defaults chosen to stay well under AppMetrica's
// Logs API request quota — the old 3s/20-poll loop was what exhausted it.
const POLL_BASE_MS = numEnv("APPMETRICA_POLL_INTERVAL_MS", 6000); // first 202 wait
const POLL_MAX_MS = numEnv("APPMETRICA_POLL_INTERVAL_MAX_MS", 20000); // ceiling per 202 wait
const MAX_WAIT_MS = numEnv("APPMETRICA_MAX_WAIT_MS", 150000); // overall deadline per request
const MAX_SLEEP_MS = numEnv("APPMETRICA_MAX_SLEEP_MS", 60000); // cap a single backoff/Retry-After sleep

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parse a Retry-After header: either delta-seconds or an HTTP-date. Returns ms.
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const when = Date.parse(value);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

// Exponential backoff for transient failures (429/5xx/network), capped.
function backoffMs(failureCount: number): number {
  return Math.min(5000 * 2 ** (failureCount - 1), MAX_SLEEP_MS);
}

export class AppMetricaClient {
  constructor(private config: Config) {}

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(BASE_URL + path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    return this.request<T>("GET", url.toString());
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = new URL(BASE_URL + path);
    return this.request<T>("POST", url.toString(), body);
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const deadline = Date.now() + MAX_WAIT_MS;
    let pollCount = 0; // 202 polls — do NOT count against the transient budget
    let transientFailures = 0; // 429 / 5xx / network errors

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `OAuth ${this.config.oauthToken}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    // Sleep, but never past the overall deadline. Returns false if the deadline
    // would be exceeded (caller should give up instead of firing another request).
    const sleepBounded = async (ms: number): Promise<boolean> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await sleep(Math.min(ms, remaining));
      return Date.now() < deadline;
    };

    while (true) {
      logger.info({ method, url, pollCount, transientFailures }, "AppMetrica request");

      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (err) {
        // Network-level failure — treat as transient with exponential backoff.
        transientFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        const wait = backoffMs(transientFailures);
        logger.warn({ error: msg, transientFailures, wait }, "Network error, backing off");
        if (transientFailures > 5 || !(await sleepBounded(wait))) {
          throw new Error(`AppMetrica request failed (network): ${msg}`);
        }
        continue;
      }

      if (response.status === 401) {
        throw new Error("Invalid OAuth token");
      }

      // Logs API: 202 = data is being prepared. Re-poll the SAME request.
      // Gentle, growing interval keeps request volume low (the old 3s loop is
      // what burned the export quota and triggered account-wide 429s).
      if (response.status === 202) {
        pollCount++;
        const wait = Math.min(POLL_BASE_MS + (pollCount - 1) * 2000, POLL_MAX_MS);
        logger.info({ url, pollCount, wait }, "AppMetrica queue: data not ready");
        if (!(await sleepBounded(wait))) {
          throw new Error(
            "AppMetrica Logs API: data still preparing when the wait budget ran out. " +
              "Re-run the same query in a few minutes (the export keeps materialising server-side), " +
              "or raise APPMETRICA_MAX_WAIT_MS."
          );
        }
        continue;
      }

      // Rate limit / server error: honor Retry-After, otherwise exponential backoff.
      if (response.status === 429 || response.status >= 500) {
        transientFailures++;
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        // Never let Retry-After (which can legitimately be 0 / sub-second) drop the
        // pause below the exponential backoff floor — otherwise a server spamming
        // 429 + Retry-After:0 would put us straight back into a tight hammer loop.
        const wait = Math.min(Math.max(retryAfter ?? 0, backoffMs(transientFailures)), MAX_SLEEP_MS);
        logger.warn(
          { status: response.status, transientFailures, retryAfter, wait },
          "Rate limited / server error, backing off"
        );
        if (!(await sleepBounded(wait))) {
          const hint =
            response.status === 429
              ? " Logs API export quota is exhausted — wait a few minutes before retrying and avoid parallel/rapid exports."
              : "";
          throw new Error(`HTTP ${response.status}: ${response.statusText}.${hint}`);
        }
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      return (await response.json()) as T;
    }
  }
}
