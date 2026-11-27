import type { PackageDetail } from "../../../shared/competitorTypes";

/** IPA-derived permission keys. Null means the package has not been analyzed yet. */
export function PermissionsSection({ packageDetail }: { packageDetail: PackageDetail }) {
  const keys = packageDetail.permissions;
  return (
    <section className="wx-detail-section wx-permissions-section" data-role="permissions-section">
      <h3 className="wx-detail-section-title">权限{keys && keys.length > 0 ? `（${keys.length}）` : ""}</h3>
      {keys === null ? (
        <p className="wx-permissions-empty">尚未解析 IPA</p>
      ) : keys.length === 0 ? (
        <p className="wx-permissions-empty">未发现权限声明</p>
      ) : (
        <div className="wx-iap-list">
          {keys.map((key) => (
            <div className="wx-iap-row" key={key}>
              <span className="wx-permissions-key">{key}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
