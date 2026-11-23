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
  it("narrows the version charts to the team picked in the section", async () => {
    vi.stubGlobal("fetch", mockShelf());
    renderPage();
    await waitForTeamSegments(2);

    const chip = (team: string) =>
      document.querySelector<HTMLElement>(`[data-role="metric-team-chip"][data-team="${team}"]`)!;
    fireEvent.click(chip("团队 A"));

    await waitFor(() => {
      expect(document.querySelectorAll('[data-role="metric-bar"]')).toHaveLength(3);
    });
    expect([...document.querySelectorAll('[data-role="metric-bar"]')]
      .every((bar) => (bar as HTMLElement).dataset.team === "团队 A")).toBe(true);
    // 团队 A has no 投放→下架 value, so that row has nothing to draw.
    expect([...document.querySelectorAll('[data-role="metric-row"]')]
      .map((row) => (row as HTMLElement).dataset.metric)).toEqual([
      "avgVersionCount",
      "avgVersionGapDays",
      "avgLatestVersionToAdDays",
    ]);
    expect([...document.querySelectorAll('[data-role="metric-row"] .wx-dist-legend-label')]
      .map((label) => label.textContent)).toEqual(["团队 A", "团队 A", "团队 A"]);

    expect(chip("团队 A").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chip("团队 A"));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-role="metric-bar"]')).toHaveLength(6);
    });
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
