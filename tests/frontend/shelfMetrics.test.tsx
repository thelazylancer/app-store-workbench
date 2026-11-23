import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WEEKS, mockShelf } from "./shelfFixtures";
import { detailRows, openDetails, packagesCalls, renderPage, waitForTeamSegments } from "./shelfHarness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("React shelf version charts", () => {
  it("filters a version chart from its own legend chips", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const chip = (metric: string, team: string) =>
      document.querySelector<HTMLElement>(
        `[data-role="metric-team-chip"][data-metric="${metric}"][data-team="${team}"]`,
      )!;
    const bars = (metric: string) =>
      document.querySelectorAll(`[data-role="metric-bar"][data-metric="${metric}"]`).length;

    // One chip per team with a value in that row: 团队 B has no 平均版本间隔.
    expect(document.querySelectorAll('[data-role="metric-team-chip"]')).toHaveLength(6);
    expect(chip("avgVersionGapDays", "团队 B")).toBeNull();

    fireEvent.click(chip("avgVersionCount", "团队 A"));
    await waitFor(() => {
      expect(bars("avgVersionCount")).toBe(1);
    });
    expect(chip("avgVersionCount", "团队 A").getAttribute("aria-pressed")).toBe("true");
    // Each chart filters on its own.
    expect(bars("avgLatestVersionToAdDays")).toBe(2);

    fireEvent.click(chip("avgVersionCount", "团队 A"));
    await waitFor(() => {
      expect(bars("avgVersionCount")).toBe(2);
    });
    expect(bars("avgLatestVersionToAdDays")).toBe(2);
  });

  it("opens the week-scoped detail from a metric bar", async () => {
    const fetchMock = mockShelf();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await waitForTeamSegments(2);

    const bar = document.querySelector<HTMLElement>(
      `[data-role="metric-row"][data-metric="avgLatestVersionToAdDays"] `
      + `[data-role="metric-bar"][data-week="${WEEKS[1]!.weekStart}"][data-team="团队 B"]`,
    );
    await openDetails(bar!);

    await waitFor(() => {
      expect(detailRows()).toHaveLength(2);
    });
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("2026-11-16 ~ 2026-11-22");
    expect(dialog.textContent).toContain("团队 B");
    const url = new URL(packagesCalls(fetchMock)[0]!, "http://localhost");
    expect(url.searchParams.get("from")).toBe("2026-11-16");
    expect(url.searchParams.get("to")).toBe("2026-11-22");
    expect(url.searchParams.get("team")).toBe("团队 B");
  });
});
