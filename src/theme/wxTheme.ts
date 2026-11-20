import { defineTheme, type DefinedTheme, type TokenValue } from "@astryxdesign/core";

declare module "@astryxdesign/core/Badge" {
  interface BadgeVariantMap {
    "wx-miss": true;
    "wx-pending": true;
    "wx-exception": true;
  }
}

const AIR = "#E7EDF2", INK = "#1C2733", BLUE = "#2E6FA3", BLUE_TEXT = "#245A87";
const AMBER = "#C97F1E", AMBER_TEXT = "#824D0E", DIM = "#545F69", DANGER = "#A5342B";
const FAINT = "rgba(28,39,51,0.38)", LINE = "rgba(28,39,51,0.16)", LINE_STRONG = "rgba(28,39,51,0.30)";
const SANS = '"Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const DATE = '"Barlow Condensed", "Arial Narrow", "Helvetica Neue", sans-serif';

/** Pin both colour schemes to the same value so system dark mode cannot alter the theme. */
const both = (value: string): TokenValue => [value, value];

/** All seven status roles are explicit; Astryx never derives the amber text colour. */
function status(role: string, fill: string, on: string, muted: string, onMuted: string, text = fill, icon = fill, border = fill): Record<string, TokenValue> {
  return {
    [`--color-${role}`]: both(fill), [`--color-on-${role}`]: both(on),
    [`--color-${role}-muted`]: both(muted), [`--color-on-${role}-muted`]: both(onMuted),
    [`--color-text-${role}`]: both(text), [`--color-icon-${role}`]: both(icon), [`--color-border-${role}`]: both(border),
  };
}

function tone(name: string, background: string, border: string, icon: string, text: string): Record<string, TokenValue> {
  return {
    [`--color-background-${name}`]: both(background), [`--color-border-${name}`]: both(border),
    [`--color-icon-${name}`]: both(icon), [`--color-text-${name}`]: both(text),
  };
}

const neutralTone = ["rgba(28,39,51,0.04)", LINE, DIM, DIM] as const;
const amberTone = ["rgba(201,127,30,0.12)", AMBER, AMBER, AMBER_TEXT] as const;

const tokens: Record<string, TokenValue> = {
  "--color-background-body": both(AIR), "--color-background-surface": both(AIR),
  "--color-background-card": both(AIR), "--color-background-popover": both(AIR),
  "--color-background-muted": both("rgba(28,39,51,0.04)"), "--color-background-inverted": both(INK),
  "--color-background-error-inverted": both(DANGER),
  "--color-text-primary": both(INK), "--color-icon-primary": both(INK),
  "--color-text-secondary": both(DIM), "--color-icon-secondary": both(DIM),
  "--color-text-disabled": both(FAINT), "--color-icon-disabled": both(FAINT),
  "--color-accent": both(BLUE), "--color-on-accent": both(AIR),
  "--color-accent-muted": both("rgba(46,111,163,0.09)"),
  "--color-text-accent": both(BLUE_TEXT), "--color-icon-accent": both(BLUE),
  ...status("info", BLUE, AIR, "rgba(46,111,163,0.09)", BLUE_TEXT, BLUE_TEXT, BLUE, BLUE),
  ...status("success", BLUE, AIR, "rgba(46,111,163,0.09)", BLUE_TEXT, BLUE_TEXT, BLUE, BLUE),
  ...status("warning", AMBER, INK, "rgba(201,127,30,0.12)", AMBER_TEXT, AMBER_TEXT, AMBER, AMBER),
  ...status("error", DANGER, "#FFFFFF", "rgba(165,52,43,0.10)", DANGER),
  "--color-border": both(LINE), "--color-border-emphasized": both(LINE_STRONG),
  "--color-overlay-hover": both("rgba(28,39,51,0.06)"), "--color-overlay-pressed": both("rgba(28,39,51,0.10)"),
  "--color-neutral": both("rgba(28,39,51,0.06)"), "--color-skeleton": both("#B7BDC6"),
  "--color-track": both("rgba(28,39,51,0.12)"), "--color-overlay": both("rgba(28,39,51,0.90)"),
  "--color-shadow": both("transparent"), "--color-tint-hover": both(INK),
  ...tone("blue", "rgba(46,111,163,0.09)", BLUE, BLUE, BLUE_TEXT),
  ...tone("yellow", ...amberTone), ...tone("orange", ...amberTone),
  ...tone("red", "rgba(165,52,43,0.10)", DANGER, DANGER, DANGER),
  ...tone("gray", "rgba(28,39,51,0.06)", LINE_STRONG, DIM, DIM),
  ...tone("cyan", ...neutralTone), ...tone("green", ...neutralTone),
  ...tone("pink", ...neutralTone), ...tone("purple", ...neutralTone), ...tone("teal", ...neutralTone),
  "--font-family-body": SANS, "--font-family-heading": SANS, "--font-family-code": MONO,
  "--font-size-xs": "11px", "--font-size-sm": "12px", "--font-size-base": "14px",
  "--font-size-lg": "17px", "--font-size-xl": "20px", "--font-size-2xl": "24px", "--font-size-3xl": "28px",
  "--text-body-size": "14px", "--text-body-weight": "400", "--text-body-leading": "1.5",
  "--text-label-size": "12px", "--text-label-weight": "600", "--text-label-leading": "1.5",
  "--text-supporting-size": "12px", "--text-supporting-weight": "400", "--text-supporting-leading": "1.5",
  "--text-code-size": "12px", "--text-code-weight": "400", "--text-code-leading": "1.5",
  "--text-heading-1-size": "24px", "--text-heading-1-leading": "1.2",
  "--text-heading-2-size": "20px", "--text-heading-2-leading": "1.2",
  "--text-heading-3-size": "17px", "--text-heading-3-leading": "1.4",
  "--text-heading-4-size": "14px", "--text-heading-4-leading": "1.5",
  "--border-width": "1px", "--focus-outline-width": "2px", "--focus-outline-style": "solid",
  "--focus-outline-color": BLUE, "--focus-outline-offset": "2px",
  "--radius-none": "0px", "--radius-inner": "2px", "--radius-element": "4px",
  "--radius-container": "8px", "--radius-page": "16px", "--radius-chat": "16px", "--radius-full": "9999px",
  "--shadow-low": "none", "--shadow-med": "none", "--shadow-high": "none",
  "--shadow-inset-hover": "none", "--shadow-inset-selected": "none", "--shadow-inset-success": "none",
  "--shadow-inset-warning": "none", "--shadow-inset-error": "none",
};

export const wxTheme: DefinedTheme = defineTheme({
  name: "wx",
  tokens,
  motion: { fast: 140, medium: 240, slow: 1200, ratio: 0.75, character: "crisp" },
  components: {
    "app-shell": { base: { backgroundColor: AIR }, "variant:section": { backgroundColor: AIR } },
    "app-shell-header": { base: { backgroundColor: AIR, minHeight: "54px" } },
    "top-nav": {
      base: { maxWidth: "1440px", marginInline: "auto", paddingInline: "32px", paddingBlock: "0px", minHeight: "54px", backgroundColor: "transparent" },
    },
    "top-nav-heading": { base: { fontSize: "15px", fontWeight: "600" } },
    "top-nav-item": {
      base: { minHeight: "54px", paddingBlock: "0px", borderRadius: "0px", fontSize: "14px", fontWeight: "400" },
      selected: { backgroundColor: "transparent", color: INK, fontWeight: "600", borderRadius: "0px", boxShadow: `inset 0 -2px 0 ${INK}` },
    },
    badge: {
      base: { borderRadius: "4px", height: "24px", paddingInline: "12px", fontSize: "12px", fontWeight: "600", lineHeight: "1.5" },
      "variant:wx-miss": { backgroundColor: "transparent", color: DIM, border: `1px dashed ${FAINT}` },
      "variant:wx-pending": { backgroundColor: AMBER, color: INK },
      "variant:wx-exception": { backgroundColor: "transparent", color: AMBER_TEXT, border: `1px solid ${AMBER}` },
    },
    skeleton: { base: { opacity: "1", backgroundColor: "rgba(28,39,51,0.05)" } },
    "empty-state": { base: { backgroundColor: "transparent", borderWidth: "0px", boxShadow: "none" } },
    text: {
      "type:code": { fontVariantNumeric: "tabular-nums" },
      "type:wx-date": { fontFamily: DATE, fontSize: "28px", fontWeight: "600", lineHeight: "1", letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums" },
      "type:wx-stat": { fontFamily: MONO, fontSize: "22px", fontWeight: "600", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" },
      "type:wx-item": { fontFamily: SANS, fontSize: "15px", fontWeight: "600", lineHeight: "1.4" },
      "type:wx-meta": { fontFamily: SANS, fontSize: "13px", lineHeight: "1.5" },
    },
    timestamp: { base: { fontFamily: MONO, fontVariantNumeric: "tabular-nums", fontSize: "12px" } },
  },
});
