import { describe, expect, it } from "vitest";
import type { ShelfPackageRow } from "../../shared/shelfTypes";
import { OTHER_KEY } from "../../src/shelf/buckets";
import { iosBucketOf, matchesSelection, type ShelfSelection } from "../../src/shelf/selection";

function row(overrides: Partial<ShelfPackageRow>): ShelfPackageRow {
  return {
    packageCode: "com.test.app",
    name: "Test",
    team: "团队 A",
    targetDate: "2026-11-10",
    weekStart: "2026-11-09",
    category: "Games",
    minimumOsVersion: "16.0",
    appVersion: "1.0",
    iap: "yes",
    privacyHost: "own",
    listingDate: null,
    offlineDate: null,
    resolved: true,
    ...overrides,
  };
}

function selection(overrides: Partial<ShelfSelection>): ShelfSelection {
  return {
    weekStart: "2026-11-09",
    weekEnd: "2026-11-15",
    team: null,
    groupBy: null,
    key: null,
    topKeys: [],
    label: "",
    ...overrides,
  };
}

describe("iosBucketOf", () => {
  it("mirrors the server buckets", () => {
    expect(iosBucketOf(row({ minimumOsVersion: "26.2" }))).toBe("26plus");
    expect(iosBucketOf(row({ minimumOsVersion: "18.4" }))).toBe("18");
    expect(iosBucketOf(row({ minimumOsVersion: "14.0" }))).toBe("lte14");
    expect(iosBucketOf(row({ minimumOsVersion: "garbage" }))).toBe("unknown");
    expect(iosBucketOf(row({ minimumOsVersion: "26.0", resolved: false }))).toBe("unknown");
  });
});

describe("matchesSelection", () => {
  it("matches every row for a whole-week selection", () => {
    expect(matchesSelection(selection({}), row({}))).toBe(true);
  });

  it("splits categories into top keys, Other and Unknown", () => {
    const games = selection({ groupBy: "category", key: "Games", topKeys: ["Games"] });
    expect(matchesSelection(games, row({ category: "Games" }))).toBe(true);
    expect(matchesSelection(games, row({ category: "Utilities" }))).toBe(false);

    const other = selection({ groupBy: "category", key: OTHER_KEY, topKeys: ["Games"] });
    expect(matchesSelection(other, row({ category: "Utilities" }))).toBe(true);
    expect(matchesSelection(other, row({ category: "Games" }))).toBe(false);
    expect(matchesSelection(other, row({ category: null, resolved: false }))).toBe(false);

    const unknown = selection({ groupBy: "category", key: "unknown", topKeys: ["Games"] });
    expect(matchesSelection(unknown, row({ category: null, resolved: false }))).toBe(true);
    expect(matchesSelection(unknown, row({ category: "Games" }))).toBe(false);
  });

  it("also narrows iOS and IAP buckets", () => {
    expect(matchesSelection(
      selection({ groupBy: "ios_version", key: "17" }),
      row({ minimumOsVersion: "17.0" }),
    )).toBe(true);
    expect(matchesSelection(
      selection({ groupBy: "ios_version", key: "17" }),
      row({ minimumOsVersion: "16.0" }),
    )).toBe(false);
    expect(matchesSelection(
      selection({ groupBy: "iap", key: "no" }),
      row({ iap: "no" }),
    )).toBe(true);
    expect(matchesSelection(
      selection({ groupBy: "iap", key: "no" }),
      row({ iap: "unknown", resolved: false }),
    )).toBe(false);
  });

  it("narrows privacy hosting kinds, with Other for the untracked tail", () => {
    const generator = selection({ groupBy: "privacy", key: "generator", topKeys: ["generator", "own"] });
    expect(matchesSelection(generator, row({ privacyHost: "generator" }))).toBe(true);
    expect(matchesSelection(generator, row({ privacyHost: "own" }))).toBe(false);

    const other = selection({ groupBy: "privacy", key: OTHER_KEY, topKeys: ["generator", "own"] });
    expect(matchesSelection(other, row({ privacyHost: "vercel" }))).toBe(true);
    expect(matchesSelection(other, row({ privacyHost: "generator" }))).toBe(false);
    expect(matchesSelection(other, row({ privacyHost: "unknown", resolved: false }))).toBe(false);
  });
});
