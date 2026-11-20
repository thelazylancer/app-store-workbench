import type { PackageDetail } from "../../../shared/competitorTypes";
import { iapEntries } from "./format";

export function IapSection({ packageDetail }: { packageDetail: PackageDetail }) {
  const items = iapEntries(packageDetail.appStoreJson);
  if (items.length === 0) return null;

  return (
    <section className="wx-detail-section wx-iap-section" data-role="iap-section">
      <h3 className="wx-detail-section-title">内购（{items.length}）</h3>
      <div className="wx-iap-list">
        {items.map((item, index) => (
          <div className="wx-iap-row" key={`${item.name}-${index}`}>
            <span className="wx-iap-name">{item.name}</span>
            <span className="wx-iap-price">{item.price || "—"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
