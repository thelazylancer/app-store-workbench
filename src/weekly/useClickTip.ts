import { useState } from "react";
import type { ChartTipState } from "../shelf/Charts";

/**
 * Shelf's hover/focus tip plus click-to-toggle, so the same detail works on
 * touch screens where hovering is impossible.
 */
export function useClickTip() {
  const [tip, setTip] = useState<ChartTipState>(null);
  const bind = (id: string, text: string) => ({
    onMouseEnter: () => setTip({ id, text }),
    onMouseLeave: () => setTip(null),
    onFocus: () => setTip({ id, text }),
    onBlur: () => setTip(null),
    onClick: () => setTip((current) => (current?.id === id ? null : { id, text })),
  });
  return { tip, bind };
}
