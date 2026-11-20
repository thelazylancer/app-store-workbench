import type { NameCandidate } from "./types";

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = temp;
    }
  }

  return previous[b.length];
}

export function namesMatch(expectedName: string, storeName: string | null): boolean {
  if (!storeName) {
    return false;
  }

  const expected = normalizeName(expectedName);
  const actual = normalizeName(storeName);

  if (!expected || !actual) {
    return false;
  }

  if (expected === actual || actual.includes(expected) || expected.includes(actual)) {
    return true;
  }

  const actualTokens = actual.split(" ");
  const expectedLength = Array.from(expected).length;

  return [actual, ...actualTokens].some((candidate) => {
    const candidateLength = Array.from(candidate).length;

    if (Math.abs(candidateLength - expectedLength) > 2) {
      return false;
    }

    return levenshtein(expected, candidate) <= 2;
  });
}

export function candidatesFromSearch(body: any): NameCandidate[] {
  const results = Array.isArray(body?.results) ? body.results : [];

  return results.map((result: any) => ({
    name: result?.trackName ?? null,
    bundleId: result?.bundleId ?? null,
    sellerName: result?.sellerName ?? null,
    trackId: typeof result?.trackId === "number" ? result.trackId : null,
    url: result?.trackViewUrl ?? null,
    minimumOsVersion: result?.minimumOsVersion ?? null,
  }));
}

export function hasProductDetail(body: any): boolean {
  const results = body?.storePlatformData?.["product-dv"]?.results;

  return Boolean(results && typeof results === "object" && Object.keys(results).length > 0);
}

export function lookupFoundFor(record: Record<string, any>): boolean {
  return record.match?.method === "bundleId";
}
