import { Button } from "@astryxdesign/core";
import { useEffect, useRef, useState } from "react";

export function CopyValue({ value, label, role }: { value: string; label: string; role: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard?.writeText) return;
    void clipboard.writeText(value).then(() => {
      window.clearTimeout(timer.current);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), 1200);
    }).catch(() => undefined);
  };

  return (
    <span className="wx-copy-value">
      <span className="wx-copy-text">{value}</span>
      <Button
        variant="ghost"
        size="sm"
        label={copied ? "已复制" : "复制"}
        aria-label={`复制 ${label}`}
        data-role={role}
        onClick={copy}
      />
    </span>
  );
}
