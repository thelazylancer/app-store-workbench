import { Badge, Banner, BreadcrumbItem, Breadcrumbs, Button, Skeleton, Text } from "@astryxdesign/core";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { PackageDetail } from "../../shared/competitorTypes";
import { useDocumentTitle } from "../app/useDocumentTitle";
import { CompetitorApiError, getCompetitorPackage } from "../lib/competitorApi";
import { teamLabel } from "../lib/teamLabel";
import { DescriptionSection } from "./detail/Description";
import { detailName, missingStatus } from "./detail/format";
import { IapSection } from "./detail/IapSection";
import { Identity } from "./detail/Identity";
import { PackageInfoSection } from "./detail/InfoRows";
import { Metrics } from "./detail/Metrics";
import { MissedPanel } from "./detail/MissedPanel";
import { PermissionsSection } from "./detail/PermissionsSection";
import { PrivacySection } from "./detail/PrivacySection";
import { Screenshots } from "./detail/Screenshots";
import { VersionHistory } from "./detail/VersionHistory";
import "./styles/detail.css";
import "./styles/detail-sections.css";

function errorMessage(error: unknown): string {
  return error instanceof CompetitorApiError ? error.message : "请求失败";
}

function DetailTop({ team, name }: { team: string; name: string }) {
  const navigate = useNavigate();
  const goBack = () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (index > 0) navigate(-1);
    else navigate("/");
  };
  const parts = ["竞品日报", team ? teamLabel(team) : "", name].filter(Boolean);

  return (
    <div className="wx-detail-top">
      <Button
        variant="ghost"
        size="sm"
        label="返回竞品日报"
        data-role="detail-back"
        icon={<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 4L5 8l4 4M5 8h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>}
        onClick={goBack}
      />
      <Breadcrumbs label="面包屑" variant="supporting">
        {parts.map((part, index) => (
          <BreadcrumbItem key={`${part}-${index}`} isCurrent={index === parts.length - 1}>
            {part}
          </BreadcrumbItem>
        ))}
      </Breadcrumbs>
    </div>
  );
}

function LoadingDetail({ code }: { code: string }) {
  return (
    <>
      <section className="wx-detail-identity" data-role="detail-identity">
        <span className="wx-detail-icon wx-detail-icon-fallback" aria-hidden="true">
          {(code || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="wx-detail-identity-copy">
          <div className="wx-detail-title-row">
            <h2>{code}</h2>
            <Badge variant="neutral" label="加载中" />
          </div>
        </div>
      </section>
      <div className="wx-detail-loading" data-role="detail-loading">
        <Text as="p" type="code" className="wx-detail-loading-label">正在加载 {code}…</Text>
        <Skeleton height={220} radius={0} />
      </div>
    </>
  );
}

export function CompetitorDetailPage() {
  useDocumentTitle("竞品日报 · App搜索工作台");
  const { code = "" } = useParams();
  const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPackageDetail(null);
    getCompetitorPackage(code)
      .then((detail) => { if (!cancelled) setPackageDetail(detail); })
      .catch((reason: unknown) => { if (!cancelled) setError(errorMessage(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [code, reload]);

  const detail = packageDetail?.packageCode === code ? packageDetail : null;
  const name = detail ? detailName(detail) : code;
  const status = detail ? missingStatus(detail.lookupStatus) : null;

  return (
    <section className="wx-detail" data-role="detail-view">
      <DetailTop team={detail?.team ?? ""} name={name} />

      {error ? (
        <Banner
          status="error"
          title="无法加载该竞品详情"
          description={`${code} 详情请求失败：${error}`}
          data-role="detail-error"
          endContent={(
            <Button
              variant="secondary"
              size="sm"
              label="重试"
              data-role="detail-retry"
              onClick={() => setReload((value) => value + 1)}
            />
          )}
        />
      ) : null}

      {!error && (loading || !detail) ? <LoadingDetail code={code} /> : null}

      {!error && detail ? (
        <>
          <Identity name={name} packageDetail={detail} status={status} />
          {status ? <MissedPanel packageDetail={detail} /> : (
            <>
              <Metrics packageDetail={detail} />
              <div className="wx-detail-columns">
                <div className="wx-detail-main">
                  <Screenshots name={name} paths={detail.screenshotLocalPaths} />
                  <IapSection packageDetail={detail} />
                  <PermissionsSection packageDetail={detail} />
                  <PrivacySection packageDetail={detail} />
                  <DescriptionSection packageDetail={detail} />
                  <VersionHistory packageDetail={detail} />
                </div>
                <aside className="wx-detail-aside">
                  <PackageInfoSection packageDetail={detail} />
                </aside>
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}

export default CompetitorDetailPage;
