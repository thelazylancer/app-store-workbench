import type { PackageDetail } from "../../../shared/competitorTypes";
import { safeExternalUrl } from "./format";

type PrivacyGroup = { label: string; categories: string[] };

/** App Privacy data lives in `appStoreJson.privacy`; older rows simply have none. */
function readPrivacy(json: Record<string, unknown>): { policyUrl: string | null; notCollected: boolean; groups: PrivacyGroup[] } | null {
  const raw = json.privacy;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { policyUrl, notCollected, groups } = raw as { policyUrl?: unknown; notCollected?: unknown; groups?: unknown };
  const parsedGroups = Array.isArray(groups)
    ? groups.flatMap((group): PrivacyGroup[] => {
      if (typeof group !== "object" || group === null) return [];
      const { label, categories } = group as { label?: unknown; categories?: unknown };
      const names = Array.isArray(categories)
        ? categories.filter((name): name is string => typeof name === "string" && name.trim() !== "")
        : [];
      return typeof label === "string" && label.trim() && names.length > 0
        ? [{ label, categories: names }]
        : [];
    })
    : [];
  const url = safeExternalUrl(typeof policyUrl === "string" ? policyUrl : null);
  const empty = notCollected === true;
  return url || empty || parsedGroups.length > 0 ? { policyUrl: url, notCollected: empty, groups: parsedGroups } : null;
}

export function PrivacySection({ packageDetail }: { packageDetail: PackageDetail }) {
  const privacy = readPrivacy(packageDetail.appStoreJson);
  if (!privacy) return null;

  return (
    <section className="wx-detail-section wx-privacy-section" data-role="privacy-section">
      <h3 className="wx-detail-section-title">隐私</h3>
      {privacy.policyUrl ? (
        <div className="wx-privacy-policy">
          <span className="wx-privacy-policy-label">隐私政策</span>
          <a className="wx-privacy-policy-url" href={privacy.policyUrl} target="_blank" rel="noreferrer">
            {privacy.policyUrl}
          </a>
        </div>
      ) : null}
      {privacy.notCollected ? <p className="wx-privacy-none">未收集数据</p> : null}
      {privacy.groups.map((group) => (
        <div className="wx-privacy-group" key={group.label}>
          <p className="wx-privacy-label">{group.label}</p>
          <div className="wx-privacy-tags">
            {group.categories.map((category) => (
              <span className="wx-privacy-tag" key={category}>{category}</span>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
