import { describe, expect, it } from "vitest";
import { classifyCandidates } from "../../server/lib/matchResults";

const candidates = [
  {
    name: "Funce AI",
    developer: "A Dev",
    appStoreUrl: "https://a",
    iconUrl: "https://img/a.png",
    description: "desc a",
    screenshotUrls: [],
  },
  {
    name: "Funce Daily",
    developer: "B Dev",
    appStoreUrl: "https://b",
    iconUrl: "https://img/b.png",
    description: "desc b",
    screenshotUrls: [],
  },
];

describe("classifyCandidates", () => {
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
