import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const AMBER = /warning|#c97f1e|#824d0e/i;
const EXCEPTION_SELECTOR = /exception|warning|abnormal/i;

function pageStyleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pageStyleFiles(path);
    return path.endsWith(".css") && path.includes(`${sep}styles${sep}`) ? [path] : [];
  });
}

function rules(css: string): { selector: string; body: string }[] {
  const result: { selector: string; body: string }[] = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    result.push({ selector: match[1]!.trim(), body: match[2]! });
  }
  return result;
}

describe("page styles", () => {
  const files = pageStyleFiles(SRC);
  const css = files.map((file) => readFileSync(file, "utf8")).join("\n");

  it("scans the page style files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("uses no shadows, and gradients only in the chart bars", () => {
    for (const file of files) {
      const fileCss = readFileSync(file, "utf8");
      expect(fileCss, file).not.toMatch(/box-shadow/i);
      if (!/charts\.css$/.test(file)) expect(fileCss, file).not.toMatch(/gradient\(/i);
    }
  });

  it("keeps amber only on exception selectors", () => {
    const offenders = rules(css)
      .filter((rule) => AMBER.test(rule.body))
      .map((rule) => rule.selector)
      .filter((selector) => !EXCEPTION_SELECTOR.test(selector));

    expect(offenders).toEqual([]);
  });
});
