import { describe, expect, it } from "vitest";
import { classifyCandidates } from "../../server/lib/matchResults";

const candidates = [
  {
    name: "Funce AI",
    developer: "A Dev",
    appleId: 6755396080,
    appStoreUrl: "https://a",
    iconUrl: "https://img/a.png",
    description: "desc a",
    screenshotUrls: [],
  },
  {
    name: "Funce Daily",
    developer: "B Dev",
    appleId: 6755396081,
    appStoreUrl: "https://b",
    iconUrl: "https://img/b.png",
    description: "desc b",
    screenshotUrls: [],
  },
];

describe("classifyCandidates", () => {
  it("selects an exact trimmed case-insensitive Bundle ID across all name-search candidates", () => {
    const suggestions = [
      ...candidates,
      { ...candidates[0], name: "Weather", bundleId: "com.example.Other" },
      { ...candidates[1], name: "Localized title", bundleId: " com.example.Target " },
    ];

    const result = classifyCandidates("Funce AI", suggestions, " COM.EXAMPLE.target ");

    expect(result).toMatchObject({
      query: "Funce AI",
      requestedBundleId: "COM.EXAMPLE.target",
      status: "matched",
      app: { name: "Localized title", bundleId: " com.example.Target ", description: "desc b" },
      alternates: [],
      message: null,
    });
    expect(result.candidates).toBe(suggestions);
    expect(suggestions.map((candidate) => candidate.name)).toEqual([
      "Funce AI", "Funce Daily", "Weather", "Localized title",
    ]);
    expect(JSON.stringify(result.candidates)).not.toContain("normalizedName");
  });

  it("returns no_match instead of a name fallback or partial Bundle ID match", () => {
    const suggestions = [
      { ...candidates[0], bundleId: "com.example.Target.extra" },
      candidates[1],
    ];

    const result = classifyCandidates("Funce AI", suggestions, " com.example.Target ");

    expect(result).toEqual({
      query: "Funce AI",
      requestedBundleId: "com.example.Target",
      status: "no_match",
      app: null,
      candidates: suggestions,
      alternates: [],
      iapHints: null,
      message: "No App Store candidate matched the supplied Bundle ID",
    });
  });

  it.each([
    { query: "Funce AI", bundleId: "", status: "matched" },
    { query: "Funce", bundleId: " \t ", status: "uncertain_match" },
    { query: "ce", bundleId: undefined, status: "no_match" },
  ])("preserves name-only classification for $status with a blank or omitted Bundle ID", ({ query, bundleId, status }) => {
    const result = classifyCandidates(query, candidates, bundleId);

    expect(result.status).toBe(status);
    expect(result).toEqual(classifyCandidates(query, candidates));
    expect(result).not.toHaveProperty("requestedBundleId");
  });

  it("preserves the Apple ID on the matched app", () => {
    const result = classifyCandidates("Funce", [
      {
        name: "Funce",
        developer: "A Dev",
        appStoreUrl: "https://a",
        iconUrl: "https://img/a.png",
        description: "desc a",
        screenshotUrls: [],
        appleId: 6755396077,
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.app?.appleId).toBe(6755396077);
  });

  it("returns matched for a clearly dominant prefix match with no close competitor", () => {
    const result = classifyCandidates("Funce", [
      {
        name: "Funce AI",
        developer: "A Dev",
        appStoreUrl: "https://a",
        iconUrl: "https://img/a.png",
        description: "desc a",
        screenshotUrls: [],
      },
      {
        name: "Weather Notes",
        developer: "B Dev",
        appStoreUrl: "https://b",
        iconUrl: "https://img/b.png",
        description: "desc b",
        screenshotUrls: [],
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.app?.name).toBe("Funce AI");
  });

  it("returns uncertain_match when multiple close name matches exist", () => {
    const result = classifyCandidates("Funce", candidates);

    expect(result.status).toBe("uncertain_match");
    expect(result.app?.name).toBe("Funce AI");
    expect(result.alternates).toHaveLength(1);
  });

  it("preserves the Apple ID on alternate candidates", () => {
    const result = classifyCandidates("Funce", candidates);

    expect(result.status).toBe("uncertain_match");
    expect(result.alternates[0]).toMatchObject({
      name: "Funce Daily",
      appleId: 6755396081,
    });
  });

  it("returns matched for a dominant substring match when the query is specific enough", () => {
    const result = classifyCandidates("tracker", [
      {
        name: "Daily Habit Tracker",
        developer: "A Dev",
        appStoreUrl: "https://a",
        iconUrl: "https://img/a.png",
        description: "desc a",
        screenshotUrls: [],
      },
      {
        name: "Weather Notes",
        developer: "B Dev",
        appStoreUrl: "https://b",
        iconUrl: "https://img/b.png",
        description: "desc b",
        screenshotUrls: [],
      },
    ]);

    expect(result.status).toBe("matched");
    expect(result.app?.name).toBe("Daily Habit Tracker");
  });

  it("returns no_match for short or weak substrings that do not clear the minimum threshold", () => {
    const result = classifyCandidates("ce", [
      {
        name: "Funce AI",
        developer: "A Dev",
        appStoreUrl: "https://a",
        iconUrl: "https://img/a.png",
        description: "desc a",
        screenshotUrls: [],
      },
    ]);

    expect(result.status).toBe("no_match");
  });
});
