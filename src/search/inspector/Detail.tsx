import { useState } from "react";
import type { IapHints, MatchedApp, SearchResult, StoreCountry } from "../../../shared/types";
import { IpaDownload } from "../IpaDownload";
import { formatIapItemCount, formatReleaseDate, translateMessage } from "../format";
import { FactPill } from "./FactsPills";
import { IapSection } from "./IapSection";
import { Identifier, InfoRow } from "./Identifiers";
import { ScreenshotGallery } from "./Screenshots";
import { VersionHistory } from "./VersionHistory";
import { formatHint, getComparisonFacts } from "./helpers";
import "../styles/inspector-sections.css";

const NO_BUNDLE_MATCH_MESSAGE = "No App Store candidate matched the supplied Bundle ID";

export type DetailState = "loading" | "ready" | "failed" | "baseline";

function DescriptionBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = text.length > 360;

  return (
    <div className="wx-description-block">
      <p className={canToggle && !expanded ? "wx-description is-clamped" : "wx-description"}>{text}</p>
      {canToggle ? (
        <button type="button" className="wx-text-toggle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "收起" : "展开"}
        </button>
      ) : null}
    </div>
  );
}

function DetailStateMessage({ state }: { state: DetailState }) {
  if (state === "ready") {
    return (
      <p className="visually-hidden" data-role="detail-state" role="status">
        商店详情已加载
      </p>
    );
  }

  return (
    <p
      className="wx-candidate-detail-state"
      data-role="detail-state"
      role="status"
      aria-busy={state === "loading"}
    >
      {state === "loading"
        ? "详情加载中…"
        : state === "failed"
          ? "详情加载失败，可重试或打开商店页。"
          : "未提供 Apple ID，仅展示搜索信息。"}
    </p>
  );
}

export function Detail({
  result,
  app,
  iapHints,
  country,
  candidateCount,
  inspectionState,
  onBack,
  onRetry,
}: {
  result: SearchResult;
  app: MatchedApp | null;
  iapHints: IapHints | null;
  country: StoreCountry;
  candidateCount: number;
  inspectionState: DetailState | null;
  onBack?: () => void;
  onRetry?: () => void;
}) {
  const query = result.query || result.requestedBundleId || "";

  if (!app) {
    const message =
      result.message !== NO_BUNDLE_MATCH_MESSAGE && result.status === "no_match" && candidateCount > 0
        ? "未自动匹配，请核对候选应用。"
        : translateMessage(result.message) ?? "暂无可展示详情。";

    return (
      <div className="wx-detail-panel" data-role="detail-panel">
        <div className="wx-inspector-top">
          <div className="wx-inspector-meta">
            <p className="wx-viewing-label">查询结果</p>
            <div className="wx-inspector-heading-row">
              <span className="row-icon-placeholder">{query.slice(0, 1).toUpperCase()}</span>
              <div className="wx-inspector-heading-copy">
                <h3>{query}</h3>
              </div>
            </div>
          </div>
        </div>
        <p className="result-message">{message}</p>
      </div>
    );
  }

  const latestVersion = app.versionHistory?.[0];
  const appStoreUrl = app.appStoreUrl.replace(
    /^(https:\/\/apps\.apple\.com\/)[a-z]{2}\//i,
    `$1${country}/`,
  );
  const hasAppleId = typeof app.appleId === "number" && Number.isSafeInteger(app.appleId) && app.appleId > 0;

  return (
    <div className="wx-detail-panel" data-role="detail-panel" data-state={inspectionState ?? undefined}>
      {onBack || (inspectionState && onRetry) || app.bundleId ? (
        <div className="wx-detail-actions">
          {onBack ? (
            <button type="button" className="wx-secondary-button" data-role="back-to-candidates" onClick={onBack}>
              返回候选
            </button>
          ) : null}
          {app.bundleId ? <IpaDownload bundleId={app.bundleId} /> : null}
          {inspectionState && onRetry ? (
            <button type="button" className="wx-secondary-button" data-role="detail-retry" onClick={onRetry}>
              重新查看详情
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="wx-inspector-top">
        <div className="wx-inspector-meta">
          <p className="wx-viewing-label">{inspectionState ? "当前查看的应用" : "自动匹配的应用"}</p>
          <div className="wx-inspector-heading-row">
            <img className="wx-app-icon" src={app.iconUrl} alt={`${app.name} icon`} />
            <div className="wx-inspector-heading-copy">
              <h3>{app.name}</h3>
              <p className="wx-developer">{app.developer}</p>
              <div className="wx-fact-row">
                <FactPill label={app.category ?? "类目未知"} />
                <FactPill label={`${app.screenshotUrls.length} 张截图`} />
                <FactPill label={formatIapItemCount(app.iapItems.length)} />
                {country === "us" && iapHints ? (
                  <>
                    <FactPill label={`4.99 ${formatHint(iapHints["4.99"])}`} />
                    <FactPill label={`9.99 ${formatHint(iapHints["9.99"])}`} />
                  </>
                ) : null}
                {latestVersion ? <FactPill label={`版本 ${latestVersion.version}`} /> : null}
                {country === "us" ? null : <FactPill label="美元价格线索仅美国区" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {inspectionState ? <DetailStateMessage state={inspectionState} /> : null}

      <div className="wx-detail-grid">
        <section className="wx-detail-section">
          <h4>商店信息</h4>
          <div className="wx-info-list">
            <InfoRow label="Apple ID">
              <Identifier label="Apple ID" value={typeof app.appleId === "number" ? String(app.appleId) : undefined} />
            </InfoRow>
            <InfoRow label="Bundle ID">
              <Identifier label="Bundle ID" value={app.bundleId} />
            </InfoRow>
            <InfoRow label="类目">{app.category ?? "未标注"}</InfoRow>
            {getComparisonFacts(app).map(([label, value]) => (
              <InfoRow key={label} label={label}>
                {value}
              </InfoRow>
            ))}
            {latestVersion ? (
              <InfoRow label="最新版本">
                {`${latestVersion.version} · ${formatReleaseDate(latestVersion.releasedAt)}`}
              </InfoRow>
            ) : null}
          </div>

          <VersionHistory items={app.versionHistory ?? []} />

          <div className="wx-inspector-links">
            <a className="primary-link" href={appStoreUrl} target="_blank" rel="noreferrer">
              打开商店页
            </a>
            {hasAppleId ? (
              <a
                className="secondary-link qimai-link"
                href={`https://www.qimai.cn/app/baseinfo/appid/${app.appleId}/country/${country}`}
                target="_blank"
                rel="noreferrer"
              >
                打开 Qimai
              </a>
            ) : null}
          </div>

          {result.message && !inspectionState ? (
            <p className="result-message">{translateMessage(result.message)}</p>
          ) : null}

          <div className="wx-detail-section wx-detail-section-subtle">
            <h5>简介</h5>
            <DescriptionBlock text={app.description} />
          </div>
        </section>

        <IapSection hints={iapHints} items={app.iapItems} country={country} />
      </div>

      <section className="wx-detail-section wx-screenshots-section">
        <h4>截图</h4>
        {app.screenshotUrls.length > 0 ? (
          <ScreenshotGallery urls={app.screenshotUrls} appName={app.name} />
        ) : (
          <p className="wx-empty-subtle">未提取到截图。</p>
        )}
      </section>
    </div>
  );
}
