import type { CompetitorWriteRepo, OfflineDateUpdate } from "./competitorRepo";
import type { OfflinePackageRow, OfflineSourceBatch } from "./offlineSource";

export type OfflineSyncWindow = { start: string; end: string };

export type OfflineSyncReport = {
  start: string;
  end: string;
  fetched: number; // unique valid package codes + invalid rows (rows after collapsing duplicates)
  matched: number; // codes present in the database (UPDATE RETURNING count)
  updated: number; // rows written; currently always equal to matched
  unmatched: number; // valid codes absent from the database (ignored, counted)
  failed: number; // invalid rows (missing code or malformed date)
};

export type OfflineSyncDeps = {
  fetchOfflinePackages: (startDay: string, endDay: string) => Promise<OfflineSourceBatch>;
  repo: Pick<CompetitorWriteRepo, "updateOfflineDates">;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Today in Beijing time (YYYY-MM-DD); Beijing has no daylight saving. */
export function beijingToday(now: Date): string {
  return new Date(now.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

/** Daily window: [today - 3, today - 1] in Beijing time. */
export function computeOfflineWindow(now: Date): OfflineSyncWindow {
  const today = beijingToday(now);
  return { start: addDays(today, -3), end: addDays(today, -1) };
}

/** Backfill window: [today - (days - 1), today] in Beijing time. */
export function computeBackfillWindow(now: Date, days: number): OfflineSyncWindow {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("days must be a positive integer");
  }
  const end = beijingToday(now);
  return { start: addDays(end, -(days - 1)), end };
}

/** Collapses duplicate codes to the largest date, preserving first-seen order. */
export function collapseOfflineDates(rows: OfflinePackageRow[]): OfflineDateUpdate[] {
  const best = new Map<string, string>();
  for (const row of rows) {
    const existing = best.get(row.packageCode);
    if (existing === undefined || row.offlineDate > existing) {
      best.set(row.packageCode, row.offlineDate);
    }
  }
  return [...best].map(([packageCode, offlineDate]) => ({ packageCode, offlineDate }));
}

/**
 * Fetches one window and writes the authoritative offline dates. A stale or
 * incomplete source range is still written; it is only warned about.
 */
export async function syncOfflinePackages(
  window: OfflineSyncWindow,
  deps: OfflineSyncDeps,
  log: (message: string) => void = (message) => console.error(message),
): Promise<OfflineSyncReport> {
  const batch = await deps.fetchOfflinePackages(window.start, window.end);
  if (batch.stale || !batch.rangeComplete) {
    log(`Offline sync warning: stale=${batch.stale} range_complete=${batch.rangeComplete}`);
  }

  const updates = collapseOfflineDates(batch.rows);
  const matchedCodes = updates.length === 0
    ? []
    : await deps.repo.updateOfflineDates(updates);

  const matched = matchedCodes.length;
  return {
    start: window.start,
    end: window.end,
    // Updates are collapsed per code, so count unique codes to keep
    // fetched = matched + unmatched + failed true.
    fetched: updates.length + batch.invalid,
    matched,
    updated: matched,
    unmatched: updates.length - matched,
    failed: batch.invalid,
  };
}
