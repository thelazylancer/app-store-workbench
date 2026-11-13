import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("structured search composer styles", () => {
  it("keeps paired rows bounded and adapts the composer and removable rows on smaller screens", () => {
    expect(styles).toContain(".query-inputs,\n.query-rows {\n  min-width: 0;");
    expect(styles).toContain(".query-row {\n  min-width: 0;\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(styles).toContain(".query-row.has-remove {\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 42px;");
    expect(styles).toContain("@media (max-width: 840px) {\n  .composer-bar {\n    grid-template-columns: minmax(0, 1fr);");
    expect(styles).toContain(".query-row,\n  .query-row.has-remove {\n    grid-template-columns: minmax(0, 1fr) 42px;");
    expect(styles).toContain(".query-name-field,\n  .query-row:not(.has-remove) .query-bundle-field {\n    grid-column: 1 / -1;");
    expect(styles).toContain('.query-field input[aria-invalid="true"] {\n  border-color: #b91c1c;');
    expect(styles).toContain(".requested-bundle {\n  display: block;\n  overflow-wrap: anywhere;");
    expect(styles).not.toMatch(/\.batch-(?:toggle|editor)|\.query-field-quick/);
  });
});

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
