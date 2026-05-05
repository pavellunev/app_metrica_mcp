import pino from "pino";
import type { Config } from "./config.js";

const logger = pino({ transport: undefined }, process.stderr);

const BASE_URL = "https://api.appmetrica.yandex.ru";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const delays = [1000, 2000, 4000];
    let lastError: Error | null = null;
    let queuePolls = 0;
    const maxQueuePolls = 20; // up to 60s total for Logs API queue

    for (let attempt = 0; attempt <= 3; attempt++) {
      logger.info({ method, url, attempt }, "AppMetrica request");

      try {
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

        const response = await fetch(url, options);

        if (response.status === 401) {
          throw new Error("Invalid OAuth token");
        }

        // Logs API: 202 means data is being prepared — poll until ready (up to 60s)
        if (response.status === 202) {
          queuePolls++;
          if (queuePolls >= maxQueuePolls) {
            throw new Error("AppMetrica Logs API: data not ready after 60s, try again later");
          }
          logger.info({ url, queuePolls }, "AppMetrica queue: data not ready, retrying in 3s");
          await sleep(3000);
          attempt--; // don't consume a retry slot for queue polling
          continue;
        }

        if (response.status === 429 || response.status >= 500) {
          const delay = delays[attempt];
          if (delay !== undefined) {
            logger.warn({ status: response.status, attempt, delay }, "Retrying after error");
            await sleep(delay);
            lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = await response.json() as T;
        return data;
      } catch (err) {
        if (err instanceof Error && err.message === "Invalid OAuth token") {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < 3) {
          const delay = delays[attempt];
          if (delay !== undefined) {
            logger.warn({ error: lastError.message, attempt, delay }, "Retrying after exception");
            await sleep(delay);
            continue;
          }
        }
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}
