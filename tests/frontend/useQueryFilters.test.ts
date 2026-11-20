import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import {
  applyFilters,
  parseFilterDate,
  parseStatus,
  readFilters,
  useQueryFilters,
} from "../../src/app/useQueryFilters";

const NOW = new Date("2026-11-20T12:00:00Z");

describe("query filters", () => {
  it("decodes valid values and falls back on invalid ones", () => {
    const parsed = readFilters(
      new URLSearchParams("date=2026-11-19&team=Alpha&category=Finance&status=miss"),
      NOW,
    );
    expect(parsed).toEqual({
      date: "2026-11-19",
      team: "Alpha",
      category: "Finance",
      status: "exception",
    });

    expect(readFilters(new URLSearchParams("date=2026-11-20&status=nope"), NOW)).toEqual({
      date: null,
      team: null,
      category: null,
      status: "all",
    });
    expect(parseStatus("hit")).toBe("hit");
    expect(parseStatus("exception")).toBe("exception");
    expect(parseFilterDate("2026-02-30", NOW)).toBeNull();
    expect(parseFilterDate("2026-11-20", NOW)).toBeNull();
  });

  it("writes filters and removes empty values", () => {
    const next = applyFilters(new URLSearchParams("date=2026-11-19&team=Alpha"), {
      team: null,
      status: "hit",
      category: "Finance",
    });
    expect(next.toString()).toBe("date=2026-11-19&category=Finance&status=hit");
    expect(applyFilters(next, { status: "all" }).toString()).toBe("date=2026-11-19&category=Finance");
  });

  it("strips legacy and invalid parameters on mount", () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(
        MemoryRouter,
        { initialEntries: ["/?date=2030-01-01&date_kind=listing&group_by=team&from=01&team=Alpha"] },
        children,
      );
    const { result } = renderHook(() => ({ location: useLocation(), query: useQueryFilters() }), {
      wrapper,
    });
    expect(result.current.location.search).toBe("?team=Alpha");
  });

  it("is the hook's single read/write seam", () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(MemoryRouter, { initialEntries: ["/?team=Alpha"] }, children);
    const { result } = renderHook(() => ({ query: useQueryFilters(), location: useLocation() }), {
      wrapper,
    });

    expect(result.current.query.filters.team).toBe("Alpha");
    act(() => result.current.query.update({ status: "hit" }));
    expect(result.current.location.search).toBe("?team=Alpha&status=hit");
    act(() => result.current.query.clear());
    expect(result.current.location.search).toBe("");
  });
});
