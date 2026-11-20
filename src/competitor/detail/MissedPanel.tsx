import { Link } from "react-router";
import type { PackageDetail } from "../../../shared/competitorTypes";
import { assetStatusLabel } from "./format";
import { InfoList } from "./InfoRows";

export function MissedPanel({ packageDetail }: { packageDetail: PackageDetail }) {
  const copy = "未命中，无 App Store 详情可展示。";

  return (
    <section className="wx-detail-section wx-package-info" data-role="missed-panel">
      <h3 className="wx-detail-section-title">源数据</h3>
      <InfoList rows={[
        ["团队", packageDetail.team || "—"],
        ["类目", packageDetail.category ?? "—"],
        ["最低 iOS", packageDetail.minimumOsVersion ?? "—"],
        ["上架日期", packageDetail.listingDate ?? "—"],
        ["下架日期", packageDetail.offlineDate ?? "—"],
        ["图片状态", assetStatusLabel(packageDetail.assetStatus)],
      ]} />
      <div className="wx-missed-block">
        <p>{copy}</p>
        <Link
          className="wx-detail-link"
          to={`/search?bundle=${encodeURIComponent(packageDetail.packageCode)}`}
        >
          到 App Store 搜索中查询此 Bundle ID
        </Link>
      </div>
    </section>
  );
}
