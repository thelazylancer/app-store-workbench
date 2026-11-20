import type { PackageDetail } from "../../../shared/competitorTypes";
import { dateOnly } from "./format";

export function VersionHistory({ packageDetail }: { packageDetail: PackageDetail }) {
  const versions = packageDetail.versions;

  return (
    <section className="wx-detail-section wx-version-section" data-role="version-history">
      <h3 className="wx-detail-section-title">更新日志</h3>
      <div className="wx-version-list">
        {versions.length === 0 ? <p className="wx-entry-empty">暂无版本记录</p> : null}
        {versions.map((version, index) => (
          <article className="wx-version-item" key={`${version.version}-${version.releasedAt}-${index}`}>
            <div className="wx-version-header">
              <strong>
                {version.version}
                {index === 0 ? <span className="wx-current-pill">当前</span> : null}
              </strong>
              <time dateTime={version.releasedAt}>{dateOnly(version.releasedAt)}</time>
            </div>
            {version.notes ? <p className="wx-version-notes">{version.notes}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
