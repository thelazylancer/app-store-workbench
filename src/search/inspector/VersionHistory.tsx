import type { AppVersionHistoryItem } from "../../../shared/types";
import { formatReleaseDate } from "../format";

const MAX_VISIBLE_VERSION_HISTORY = 5;

export function VersionHistory({ items }: { items: AppVersionHistoryItem[] }) {
  if (items.length === 0) {
    return null;
  }

  const visible = items.slice(0, MAX_VISIBLE_VERSION_HISTORY);

  return (
    <details className="wx-version-history" open>
      <summary>
        {items.length > visible.length
          ? `版本历史 · 最近 ${visible.length} 个（共 ${items.length} 个）`
          : `版本历史 · ${items.length} 个版本`}
      </summary>
      <div className="wx-version-history-list">
        {visible.map((item) => (
          <article className="wx-version-history-item" key={`${item.version}-${item.releasedAt}`}>
            <div className="wx-version-history-header">
              <strong>{`版本 ${item.version}`}</strong>
              <time dateTime={item.releasedAt ?? ""}>{formatReleaseDate(item.releasedAt)}</time>
            </div>
            {item.notes ? <p className="wx-version-history-notes">{item.notes}</p> : null}
          </article>
        ))}
      </div>
    </details>
  );
}
