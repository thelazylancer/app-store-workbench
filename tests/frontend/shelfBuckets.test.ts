import { describe, expect, it } from "vitest";
import type { ShelfGroupCount } from "../../shared/shelfTypes";
import { privacyHostKind, privacyHostLabel } from "../../shared/privacyHost";
import {
  OTHER_KEY,
  categoryLabel,
  foldTopCategories,
  foldWeekGroups,
  iapLabel,
  iosBucketLabel,
  segmentGroups,
  sourceAppName,
} from "../../src/shelf/buckets";

describe("privacyHostKind", () => {
  it("buckets the policy URL by hosting domain", () => {
    expect(privacyHostKind("https://www.freeprivacypolicy.com/live/abc")).toBe("generator");
    expect(privacyHostKind("https://fitlife-legal.pages.dev/privacy")).toBe("cloudflare");
    expect(privacyHostKind("https://campcrate.campcrate.workers.dev/privacy")).toBe("cloudflare");
    expect(privacyHostKind("https://docs.google.com/document/d/abc")).toBe("google");
    expect(privacyHostKind("https://holmreach.web.app/privacy")).toBe("google");
    expect(privacyHostKind("https://appprivacy.github.io/privacy")).toBe("github");
    expect(privacyHostKind("https://fevinex.vercel.app/privacy")).toBe("vercel");
    expect(privacyHostKind("https://x.chatgpt.site/privacy")).toBe("chatgpt");
    expect(privacyHostKind("https://gamma.example.com/privacy")).toBe("own");
    expect(privacyHostKind("https://apps.apple.com/app/id42")).toBe("app_store");
  });

  it("returns unknown for a missing or unparseable URL", () => {
    expect(privacyHostKind(null)).toBe("unknown");
    expect(privacyHostKind("")).toBe("unknown");
    expect(privacyHostKind("not a url")).toBe("unknown");
    expect(privacyHostLabel("unknown")).toBe("未知");
    expect(privacyHostLabel("own")).toBe("自有域名");
    expect(privacyHostLabel("generator")).toBe("模板站");
    expect(privacyHostLabel("github")).toBe("Github");
    expect(privacyHostLabel("chatgpt")).toBe("Chatgpt");
  });
});

describe("iosBucketLabel", () => {
  it("labels every bucket, including 26+ and Unknown", () => {
    expect(iosBucketLabel("lte14")).toBe("≤14");
    expect(iosBucketLabel("26plus")).toBe("26+");
    expect(iosBucketLabel("unknown")).toBe("Unknown");
    expect(iosBucketLabel("17")).toBe("17");
    expect(iapLabel("yes")).toBe("有");
    expect(iapLabel("no")).toBe("无");
    expect(iapLabel("unknown")).toBe("Unknown");
  });
});

describe("categoryLabel", () => {
  it("keeps App Store's own category name", () => {
    expect(categoryLabel("Games")).toBe("Games");
    expect(categoryLabel("Utilities")).toBe("Utilities");
    expect(categoryLabel("Photo & Video")).toBe("Photo & Video");
  });

  it("renders missing values as Unknown", () => {
    expect(categoryLabel(null)).toBe("Unknown");
    expect(categoryLabel("")).toBe("Unknown");
    expect(categoryLabel("unknown")).toBe("Unknown");
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

describe("sourceAppName", () => {
  it("strips the source's tracking markers", () => {
    expect(sourceAppName("iOS-CheezsiiOS")).toBe("Cheezsi");
    expect(sourceAppName("iOS-luminearniOSjufeng")).toBe("luminearn");
    expect(sourceAppName("iOS-SmiloeiosL")).toBe("Smiloe");
    expect(sourceAppName("iOS-BeluniiOS-LC")).toBe("Beluni");
    expect(sourceAppName("iOS-SloxWuiniOS-S")).toBe("SloxWuin");
    expect(sourceAppName("iOS-*MilboiOS")).toBe("Milbo");
    expect(sourceAppName("Plain Name")).toBe("Plain Name");
  });

  it("falls back to the raw value when stripping leaves nothing", () => {
    expect(sourceAppName("iOS-iOS")).toBe("iOS-iOS");
  });
});

describe("foldTopCategories", () => {
  it("keeps Top 6 by range totals, folds the rest into Other and puts Unknown last", () => {
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
    expect(segments[0]).toEqual({ key: "Games", label: "Games", count: 30 });
    expect(segments[6]).toEqual({ key: OTHER_KEY, label: "Other", count: 8 });
    expect(segments[7]).toEqual({ key: "unknown", label: "Unknown", count: 17 });
  });

  it("omits Other when there are exactly six known categories", () => {
    const segments = foldTopCategories(totals.slice(0, 6));
    expect(segments).toHaveLength(6);
    expect(segments.some((segment) => segment.key === OTHER_KEY)).toBe(false);
  });

  it("handles all-unknown and empty groups", () => {
    expect(foldTopCategories([{ key: "unknown", count: 4 }])).toEqual([
      { key: "unknown", label: "Unknown", count: 4 },
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
      .toEqual(["≤14", "15", "16", "17", "18", "26+", "Unknown"]);
    expect(segmentGroups("iap", []).map((segment) => segment.label)).toEqual(["有", "无", "Unknown"]);
  });
});

describe("foldWeekGroups", () => {
  it("folds below-top categories into Other and keeps Unknown apart", () => {
    const segments = foldTopCategories([
      { key: "Games", count: 10 },
      { key: "Utilities", count: 8 },
      { key: "Productivity", count: 6 },
      { key: "Social Networking", count: 5 },
      { key: "Entertainment", count: 4 },
      { key: "Photo & Video", count: 3 },
      { key: "Travel", count: 2 },
      { key: "unknown", count: 5 },
    ]);
    const week = foldWeekGroups([
      { key: "Games", count: 2 },
      { key: "Travel", count: 1 },
      { key: "unknown", count: 3 },
    ], segments);

    expect(week.Games).toBe(2);
    expect(week[OTHER_KEY]).toBe(1);
    expect(week.unknown).toBe(3);
  });
});
