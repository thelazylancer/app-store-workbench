import type { LookupCandidate, MatchedApp, SearchResult, StoreCountry } from "../../../shared/types";
import { FactPill } from "./FactsPills";
import { Identifier } from "./Identifiers";
import { ScreenshotGallery } from "./Screenshots";
import { candidateKey, getCandidates, getComparisonFacts } from "./helpers";
import "../styles/inspector-sections.css";
import "../styles/inspector-candidates.css";

const PAGE_SIZE = 10;

function CandidateCard({
  app,
  rank,
  label,
  current,
  country,
  onInspect,
}: {
  app: LookupCandidate;
  rank: number;
  label: string;
  current: boolean;
  country: StoreCountry;
  onInspect: () => void;
}) {
  return (
    <article
      className={current ? "wx-candidate-card is-current" : "wx-candidate-card"}
      data-candidate-key={candidateKey(app)}
    >
      <div className="wx-candidate-card-header">
        {label ? <span className="wx-candidate-tag">{label}</span> : null}
        <span className="wx-candidate-rank">{`#${String(rank).padStart(2, "0")}`}</span>
      </div>

      <div className="wx-candidate-body">
        {app.iconUrl ? (
          <img className="wx-candidate-icon" src={app.iconUrl} alt="" />
        ) : (
          <span className="row-icon-placeholder wx-candidate-icon">
            {app.name.slice(0, 1).toUpperCase()}
          </span>
        )}

        <div className="wx-candidate-copy">
          <strong>{app.name}</strong>
          <span>{app.developer}</span>
          <span className="wx-candidate-apple-id">
            <span className="wx-identifier-label">Apple ID：</span>
            <Identifier
              label="Apple ID"
              value={typeof app.appleId === "number" ? String(app.appleId) : undefined}
            />
          </span>
          <span className="wx-candidate-bundle-id">
            <span className="wx-identifier-label">Bundle ID：</span>
            <Identifier label="Bundle ID" value={app.bundleId} />
          </span>
          <span>{`${app.category ?? "类目未知"} · ${app.screenshotUrls.length} 张截图`}</span>
          <div className="wx-candidate-facts">
            {getComparisonFacts(app).map(([factLabel, value]) => (
              <span key={factLabel}>{`${factLabel}：${value}`}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="wx-candidate-footer">
        {app.screenshotUrls.length > 0 ? (
          <ScreenshotGallery
            urls={app.screenshotUrls}
            appName={app.name}
            limit={3}
            compact
          />
        ) : null}
        <button
          type="button"
          className="wx-candidate-inspect"
          data-role="candidate-inspect"
          data-candidate-key={candidateKey(app)}
          aria-label={`查看 ${app.name} 的详情，${app.appleId ? `Apple ID ${app.appleId}` : app.developer}`}
          aria-pressed={current}
          onClick={onInspect}
        >
          {current ? "重新查看详情" : "查看详情"}
        </button>
        <a
          className="wx-candidate-link"
          href={app.appStoreUrl.replace(/^(https:\/\/apps\.apple\.com\/)[a-z]{2}\//i, `$1${country}/`)}
          target="_blank"
          rel="noreferrer"
        >
          打开商店页
        </a>
      </div>
    </article>
  );
}

function Pager({
  location,
  page,
  pages,
  onPageChange,
}: {
  location: "top" | "bottom";
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  const top = location === "top";
  const prefix = top ? "candidates-top" : "candidates";
  return (
    <nav className="wx-candidate-pagination" aria-label={`候选结果分页（${top ? "顶部" : "底部"}）`} hidden={pages === 0}>
      <button
        type="button"
        className="wx-secondary-button"
        data-role={`${prefix}-prev`}
        aria-label={`${top ? "顶部" : "底部"}：上一页候选`}
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        上一页
      </button>
      <span data-role={top ? "candidate-page-top" : "candidate-page"} role="status">
        {`第 ${page + 1} / ${pages} 页`}
      </span>
      <button
        type="button"
        className="wx-secondary-button"
        data-role={`${prefix}-next`}
        aria-label={`${top ? "顶部" : "底部"}：下一页候选`}
        disabled={page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}

export function Candidates({
  result,
  country,
  currentApp,
  inspecting,
  filter,
  page,
  onFilterChange,
  onPageChange,
  onInspect,
}: {
  result: SearchResult;
  country: StoreCountry;
  currentApp: MatchedApp | null;
  inspecting: boolean;
  filter: string;
  page: number;
  onFilterChange: (filter: string) => void;
  onPageChange: (page: number) => void;
  onInspect: (candidate: LookupCandidate) => void;
}) {
  const candidates = getCandidates(result);
  const query = filter.trim().toLowerCase();

  const filtered = candidates.filter(
    (candidate) => !query || candidate.bundleId?.toLowerCase().includes(query),
  );
  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const currentKey = currentApp ? candidateKey(currentApp) : null;

  return (
    <section className="wx-candidates">
      <p className="wx-candidates-label">候选对比</p>

      <Pager location="top" page={currentPage} pages={pages} onPageChange={onPageChange} />

      <div className="wx-candidate-list">
        <div className="wx-candidate-list-header">
          <strong data-role="candidate-count" role="status">
            {query ? `筛选 ${filtered.length} / ${candidates.length} 个候选` : `共 ${candidates.length} 个候选`}
          </strong>
          {candidates.length > 1 ? (
            <div className="wx-candidate-filter">
              <label>
                Bundle ID
                <input
                  type="text"
                  name="candidate-bundle-filter"
                  data-role="candidate-bundle-filter"
                  placeholder="输入 Bundle ID 片段"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  value={filter}
                  onChange={(event) => onFilterChange(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="wx-secondary-button"
                data-role="candidate-filter-clear"
                aria-label="清除 Bundle ID 筛选"
                disabled={filter.length === 0}
                onClick={() => onFilterChange("")}
              >
                清除
              </button>
            </div>
          ) : null}
        </div>

        <div className="wx-candidate-list-items">
          {visible.map((candidate, index) => {
            const current = currentKey !== null && candidateKey(candidate) === currentKey;
            return (
              <CandidateCard
                key={candidateKey(candidate)}
                app={current && currentApp ? currentApp : candidate}
                rank={currentPage * PAGE_SIZE + index + 1}
                label={current ? (inspecting ? "当前查看" : "自动匹配应用") : ""}
                current={current}
                country={country}
                onInspect={() => onInspect(candidate)}
              />
            );
          })}
          {filtered.length === 0 ? (
            <p className="wx-empty-subtle">本次返回的候选中没有匹配的 Bundle ID。</p>
          ) : null}
        </div>
      </div>

      <Pager location="bottom" page={currentPage} pages={pages} onPageChange={onPageChange} />
    </section>
  );
}
