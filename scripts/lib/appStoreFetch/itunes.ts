export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const REQUEST_RETRIES = 3;

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export async function requestJson(
  url: string,
  headers: Record<string, string>,
  delayMs: number,
): Promise<any> {
  let lastError: unknown = new Error("request failed");

  for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
    const waitMs = delayMs - (Date.now() - lastRequestAt);

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastRequestAt = Date.now();

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }

      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      lastError = error;

      if (attempt < REQUEST_RETRIES - 1) {
        await sleep(5000 * 2 ** attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
