import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { isDateString } from "../lib/reportDate";

const WEEK_PARAM = "week";

/** `?week=` is the only weekly query parameter; malformed values fall back to the default week. */
export function readWeekParam(params: URLSearchParams): string | null {
  const raw = params.get(WEEK_PARAM)?.trim() ?? "";
  return isDateString(raw) ? raw : null;
}

/** The only query seam for the weekly page; writes replace history entries. */
export function useWeeklyWeek() {
  const [params, setParams] = useSearchParams();
  const week = readWeekParam(params);

  const setWeek = useCallback((next: string | null) => {
    setParams((current) => {
      const copy = new URLSearchParams(current);
      if (next) copy.set(WEEK_PARAM, next);
      else copy.delete(WEEK_PARAM);
      return copy;
    }, { replace: true });
  }, [setParams]);

  return { week, setWeek };
}
