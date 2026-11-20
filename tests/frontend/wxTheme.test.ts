import { describe, expect, it } from "vitest";
import { wxTheme } from "../../src/theme/wxTheme";

const token = (name: string) => wxTheme.tokens[name];

describe("wxTheme", () => {
  it("writes all seven roles for every status, including amber text", () => {
    const roles = {
      info: ["#2E6FA3", "#245A87"],
      success: ["#2E6FA3", "#245A87"],
      warning: ["#C97F1E", "#824D0E"],
      error: ["#A5342B", "#A5342B"],
    } as const;

    for (const [role, [fill, text]] of Object.entries(roles)) {
      for (const key of [
        `--color-${role}`,
        `--color-on-${role}`,
        `--color-${role}-muted`,
        `--color-on-${role}-muted`,
        `--color-text-${role}`,
        `--color-icon-${role}`,
        `--color-border-${role}`,
      ]) {
        expect(token(key), key).toMatch(/^light-dark\(/);
      }
      expect(token(`--color-${role}`)).toBe(`light-dark(${fill}, ${fill})`);
      expect(token(`--color-text-${role}`)).toBe(`light-dark(${text}, ${text})`);
    }
  });

  it("pins the sky-observatory palette, fonts and focus ring", () => {
    expect(token("--color-background-body")).toBe("light-dark(#E7EDF2, #E7EDF2)");
    expect(token("--color-text-primary")).toBe("light-dark(#1C2733, #1C2733)");
    expect(token("--color-accent")).toBe("light-dark(#2E6FA3, #2E6FA3)");
    expect(token("--color-text-accent")).toBe("light-dark(#245A87, #245A87)");
    expect(token("--color-border")).toBe("light-dark(rgba(28,39,51,0.16), rgba(28,39,51,0.16))");
    expect(token("--font-family-body")).toContain("Noto Sans SC");
    expect(token("--font-family-code")).toContain("IBM Plex Mono");
    expect(token("--focus-outline-color")).toBe("#2E6FA3");
    expect(token("--focus-outline-width")).toBe("2px");
    expect(token("--focus-outline-offset")).toBe("2px");
    expect(token("--shadow-low")).toBe("none");
  });

  it("keeps navigation as an ink underline and badges off pills", () => {
    const navItem = wxTheme.components?.["top-nav-item"];
    expect(wxTheme.components?.["top-nav"]?.base).toMatchObject({ minHeight: "54px", paddingBlock: "0px" });
    expect(navItem?.base).toMatchObject({ minHeight: "54px", paddingBlock: "0px" });
    expect(navItem?.selected).toMatchObject({ borderRadius: "0px", color: "#1C2733", fontWeight: "600" });
    expect(String(navItem?.selected?.boxShadow)).toContain("inset 0 -2px 0 #1C2733");

    const badge = wxTheme.components?.badge;
    expect(badge?.base).toMatchObject({ borderRadius: "4px", height: "24px", fontSize: "12px", fontWeight: "600" });
    expect(badge?.["variant:wx-exception"]).toMatchObject({ color: "#824D0E" });
  });

  it("reserves Barlow Condensed for the date text type", () => {
    const text = wxTheme.components?.text;
    expect(String(text?.["type:wx-date"]?.fontFamily)).toContain("Barlow Condensed");
    expect(String(text?.["type:wx-meta"]?.fontFamily)).toContain("Noto Sans SC");
    expect(text?.["type:code"]?.fontVariantNumeric).toBe("tabular-nums");
    expect(wxTheme.components?.timestamp?.base).toMatchObject({ fontFamily: expect.stringContaining("IBM Plex Mono") });
  });
});
