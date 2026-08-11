import { describe, expect, it } from "vitest";
import { filterResults, type ResultFilters } from "../../src/lib/filterResults";
import type { SearchResult } from "../../shared/types";

const results: SearchResult[] = [
  {
    query: "Funce",
    status: "matched",
    app: {
      name: "Funce",
      developer: "A Dev",
      appStoreUrl: "https://apps.apple.com/us/app/funce",
      iconUrl: "https://example.com/icon.png",
      description: "A short description",
      category: "Travel",
      versionHistory: [],
      screenshotUrls: ["https://example.com/1.png"],
      iapItems: [{ name: "Pack", price: "$4.99" }],
    },
    alternates: [],
    iapHints: {
      "4.99": "found",
      "9.99": "not_found",
      source: "rendered_page",
    },
    message: null,
  },
  {
    query: "Maybe Funce",
    status: "uncertain_match",
    app: {
      name: "Maybe Funce",
      developer: "B Dev",
      appStoreUrl: "https://apps.apple.com/us/app/maybe-funce",
      iconUrl: "https://example.com/icon-2.png",
      description: "Another description",
      category: "Lifestyle",
      versionHistory: [],
      screenshotUrls: [],
      iapItems: [],
    },
    alternates: [],
    iapHints: {
      "4.99": "unavailable",
      "9.99": "unavailable",
      source: "best_effort",
    },
    message: "Possible match found; review alternates",
  },
  {
    query: "Missing App",
    status: "no_match",
    app: null,
    alternates: [],
    iapHints: null,
    message: "No App Store match found in US store",
  },
];

describe("filterResults", () => {
  it("returns all results when no filters are active", () => {
    const filters: ResultFilters = {
      status: "all",
      screenshotsOnly: false,
      iapMatchedOnly: false,
    };

    expect(filterResults(results, filters)).toHaveLength(3);
  });

  it("filters by status", () => {
    const filters: ResultFilters = {
      status: "matched",
      screenshotsOnly: false,
      iapMatchedOnly: false,
    };

    expect(filterResults(results, filters).map((item) => item.query)).toEqual(["Funce"]);
  });

  it("filters to apps with screenshots", () => {
    const filters: ResultFilters = {
      status: "all",
      screenshotsOnly: true,
      iapMatchedOnly: false,
    };

    expect(filterResults(results, filters).map((item) => item.query)).toEqual(["Funce"]);
  });

  it("filters to apps with target iap price matches", () => {
    const filters: ResultFilters = {
      status: "all",
      screenshotsOnly: false,
      iapMatchedOnly: true,
    };

    expect(filterResults(results, filters).map((item) => item.query)).toEqual(["Funce"]);
  });

  it("supports combining status and toggle filters", () => {
    const filters: ResultFilters = {
      status: "uncertain_match",
      screenshotsOnly: true,
      iapMatchedOnly: false,
    };

    expect(filterResults(results, filters)).toHaveLength(0);
  });
});
