import { useState, type ReactNode } from "react";

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wx-info-row">
      <span className="wx-info-row-label">{label}</span>
      <span className="wx-info-row-value">{children}</span>
    </div>
  );
}

export function Identifier({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim() ? value : "未提供";
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);

  async function copy() {
    if (copying || text === "未提供") {
      return;
    }

    setCopying(true);
    setStatus("");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      setStatus("已复制");
    } catch {
      setStatus("复制失败，请手动选择标识");
    } finally {
      setCopying(false);
    }
  }

  return (
    <span className="wx-identifier">
      <span className="wx-identifier-text">{text}</span>
      {text === "未提供" ? null : (
        <button
          type="button"
          className="wx-identifier-copy"
          aria-label={`复制 ${label}：${text}`}
          aria-disabled={copying}
          onClick={copy}
        >
          复制
        </button>
      )}
      <span className="wx-identifier-status" role="status">
        {status}
      </span>
    </span>
  );
}
