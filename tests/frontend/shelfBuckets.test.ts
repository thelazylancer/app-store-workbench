import { describe, expect, it } from "vitest";
import type { ShelfGroupCount } from "../../shared/shelfTypes";
import {
  OTHER_KEY,
  categoryLabel,
  foldTopCategories,
  iapLabel,
  iosBucketLabel,
  segmentGroups,
} from "../../src/shelf/buckets";

describe("iosBucketLabel", () => {
  it("labels every bucket, including 26+ and 未知", () => {
    expect(iosBucketLabel("lte14")).toBe("≤14");
    expect(iosBucketLabel("26plus")).toBe("26+");
    expect(iosBucketLabel("unknown")).toBe("未知");
    expect(iosBucketLabel("17")).toBe("17");
    expect(iapLabel("yes")).toBe("有");
    expect(iapLabel("no")).toBe("无");
    expect(iapLabel("unknown")).toBe("未知");
  });
});

describe("categoryLabel", () => {
  it("maps known genres and falls back to the raw English value", () => {
    expect(categoryLabel("Games")).toBe("游戏");
    expect(categoryLabel("Utilities")).toBe("工具");
    expect(categoryLabel("Photo & Video")).toBe("摄影与录像");
    expect(categoryLabel("Some New Genre")).toBe("Some New Genre");
  });

  it("renders missing values as 未知", () => {
    expect(categoryLabel(null)).toBe("未知");
    expect(categoryLabel("")).toBe("未知");
    expect(categoryLabel("unknown")).toBe("未知");
  });
});

const totals: ShelfGroupCount[] = [
  { key: "Games", count: 30 },
  { key: "Utilities", count: 20 },
  { key: "Productivity", count: 15 },
  { key: "Social Networking", count: 12 },
  { key: "Photo & Video", count: 10 },
  { key: "Finance", count: 8 },
  { key: "Travel", count: 5 },
  { key: "Books", count: 3 },
  { key: "unknown", count: 17 },
];

describe("foldTopCategories", () => {
  it("keeps Top 6 by range totals, folds the rest into 其他 and puts 未知 last", () => {
    const segments = foldTopCategories(totals);
    expect(segments.map((segment) => segment.key)).toEqual([
      "Games",
      "Utilities",
      "Productivity",
      "Social Networking",
      "Photo & Video",
      "Finance",
      OTHER_KEY,
      "unknown",
    ]);
    expect(segments[0]).toEqual({ key: "Games", label: "游戏", count: 30 });
    expect(segments[6]).toEqual({ key: OTHER_KEY, label: "其他", count: 8 });
    expect(segments[7]).toEqual({ key: "unknown", label: "未知", count: 17 });
  });

  it("omits 其他 when there are exactly six known categories", () => {
    const segments = foldTopCategories(totals.slice(0, 6));
    expect(segments).toHaveLength(6);
    expect(segments.some((segment) => segment.key === OTHER_KEY)).toBe(false);
  });

  it("handles all-unknown and empty groups", () => {
    expect(foldTopCategories([{ key: "unknown", count: 4 }])).toEqual([
      { key: "unknown", label: "未知", count: 4 },
    ]);
    expect(foldTopCategories([])).toEqual([]);
  });

  it("breaks count ties by key order", () => {
    const segments = foldTopCategories([
      { key: "Games", count: 5 },
      { key: "Books", count: 5 },
    ]);
    expect(segments.map((segment) => segment.key)).toEqual(["Books", "Games"]);
  });
});

describe("segmentGroups", () => {
  it("uses the fixed iOS and IAP orders", () => {
    expect(segmentGroups("ios_version", [{ key: "16", count: 3 }]).map((segment) => segment.label))
      .toEqual(["≤14", "15", "16", "17", "18", "26+", "未知"]);
    expect(segmentGroups("iap", []).map((segment) => segment.label)).toEqual(["有", "无", "未知"]);
  });
});
