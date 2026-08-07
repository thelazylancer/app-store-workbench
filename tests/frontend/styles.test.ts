import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("screenshot lightbox styles", () => {
  it("keeps a single horizontal gallery at the App Store screenshot ratio", () => {
    expect(styles).toContain(".screenshots {\n  display: flex;");
    expect(styles).not.toContain("grid-auto-flow: column;");
    expect(styles).not.toContain("grid-auto-columns: minmax(170px, 230px);");
    expect(styles.match(/\.screenshot-lightbox-image \{/g)).toHaveLength(2);
    expect(styles).toContain(".screenshot-lightbox-strip {\n  display: flex;");
    expect(styles).toContain("flex-flow: row nowrap;");
    expect(styles).toContain("aspect-ratio: 1290 / 2796;");
    expect(styles).toContain(".screenshot-lightbox-slide {");
    expect(styles).toContain(".screenshot-lightbox-placeholder {");
    expect(styles).toContain("@keyframes lightbox-spin");
    expect(styles).toContain("animation: none !important;");
    expect(styles).not.toContain(".lightbox-gallery");
    expect(styles).not.toContain("grid-auto-rows: minmax(0, 1fr);");
  });
});
