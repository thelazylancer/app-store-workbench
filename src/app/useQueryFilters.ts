import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { isDateString, yesterdayUtc, type StatusFilter } from "../lib/reportDate";

export type QueryFilters = {
  date: string | null;
  team: string | null;
  category: string | null;
  status: StatusFilter;
};

export function parseStatus(value: string | null): StatusFilter {
  if (value === "hit") return "hit";
  if (value === "exception" || value === "miss") return "exception";
  return "all";
}

export function parseFilterDate(value: string | null, now = new Date()): string | null {
  if (!isDateString(value) || value > yesterdayUtc(now)) return null;
  return value;
}

export function readFilters(params: URLSearchParams, now = new Date()): QueryFilters {
  const team = params.get("team");
  const category = params.get("category");
  return {
    date: parseFilterDate(params.get("date"), now),
    team: team || null,
    category: category || null,
    status: parseStatus(params.get("status")),
  };
}

/** Return a copy of `current` with one or more filters applied; empty means removed. */
export function applyFilters(current: URLSearchParams, patch: Partial<QueryFilters>): URLSearchParams {
  const next = new URLSearchParams(current);
  const set = (key: string, value: string | null | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  if ("date" in patch) set("date", patch.date);
  if ("team" in patch) set("team", patch.team);
  if ("category" in patch) set("category", patch.category);
  if ("status" in patch) set("status", patch.status === "all" ? null : patch.status);
  return next;
}

/** The only query seam for the competitor pages. Writes replace like the old commit(). */
export function useQueryFilters() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const rawDate = params.get("date");
  const needsNormalize = params.has("date_kind") || params.has("group_by") || params.has("from")
    || (Boolean(rawDate) && filters.date !== rawDate);

  // One-shot cleanup of legacy or invalid parameters, as the old commit("replace") did.
  useEffect(() => {
    if (!needsNormalize) return;
    const next = new URLSearchParams(params);
    next.delete("date_kind");
    next.delete("group_by");
    next.delete("from");
    if (rawDate && filters.date === null) next.delete("date");
    setParams(next, { replace: true });
  }, [needsNormalize]);

  const update = (patch: Partial<QueryFilters>) =>
    setParams((current) => applyFilters(current, patch), { replace: true });
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  return { filters, update, clear };
}
