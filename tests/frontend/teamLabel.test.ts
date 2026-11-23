import { describe, expect, it } from "vitest";
import { teamLabel } from "../../src/lib/teamLabel";

describe("teamLabel", () => {
  it("maps the known teams to their initials", () => {
    expect(teamLabel("巨风")).toBe("JF");
    expect(teamLabel("大容")).toBe("DR");
    expect(teamLabel("蓝麟")).toBe("LL");
    expect(teamLabel("驰猿")).toBe("CY");
    expect(teamLabel("JODO")).toBe("JD");
    expect(teamLabel("LivChat")).toBe("LC");
    expect(teamLabel("灵蜂")).toBe("LF");
  });

  it("falls back to word initials for English names and the full name otherwise", () => {
    expect(teamLabel("Puzzle Lab")).toBe("PL");
    expect(teamLabel("新团队")).toBe("新团队");
  });
});
