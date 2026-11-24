/**
 * Hosting bucket for an App Store privacy-policy URL, derived from its domain.
 * Shared so the shelf aggregation and the detail dialog agree on every key.
 */
export type PrivacyHostKind =
  | "own"
  | "generator"
  | "cloudflare"
  | "google"
  | "github"
  | "chatgpt"
  | "vercel"
  | "netlify"
  | "surge"
  | "notion"
  | "clickup"
  | "bunny"
  | "app_store"
  | "unknown";

// Ordered: the first matching suffix wins (docs.google.com before google).
const HOST_SUFFIXES: [PrivacyHostKind, string[]][] = [
  ["app_store", ["apps.apple.com", "itunes.apple.com"]],
  [
    "generator",
    [
      "freeprivacypolicy.com",
      "privacypolicies.com",
      "termsfeed.com",
      "privacypolicygenerator.info",
      "app-privacy-policy-generator.com",
    ],
  ],
  ["cloudflare", ["pages.dev", "workers.dev"]],
  ["google", ["docs.google.com", "drive.google.com", "web.app", "run.app", "firebaseapp.com"]],
  ["github", ["github.io"]],
  ["chatgpt", ["chatgpt.site"]],
  ["vercel", ["vercel.app"]],
  ["netlify", ["netlify.app"]],
  ["surge", ["surge.sh"]],
  ["notion", ["notion.com", "notion.so", "notion.site"]],
  ["clickup", ["clickup.com"]],
  ["bunny", ["b-cdn.net"]],
];

function hostname(policyUrl: string): string | null {
  try {
    return new URL(policyUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Unknown when there is no usable URL, otherwise the matched platform or "own". */
export function privacyHostKind(policyUrl: string | null | undefined): PrivacyHostKind {
  const raw = policyUrl?.trim();
  if (!raw) return "unknown";
  const host = hostname(raw);
  if (!host) return "unknown";
  for (const [kind, suffixes] of HOST_SUFFIXES) {
    if (suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return kind;
  }
  return "own";
}

const LABELS: Record<PrivacyHostKind, string> = {
  own: "自有域名",
  generator: "模板站",
  cloudflare: "Cloudflare",
  google: "Google",
  github: "Github",
  chatgpt: "Chatgpt",
  vercel: "Vercel",
  netlify: "Netlify",
  surge: "Surge",
  notion: "Notion",
  clickup: "ClickUp",
  bunny: "Bunny CDN",
  app_store: "App Store",
  unknown: "未知",
};

export function privacyHostLabel(kind: string): string {
  return LABELS[kind as PrivacyHostKind] ?? kind;
}
