import type { IapHints, IapItem, StoreCountry } from "../../../shared/types";
import { formatHint } from "./helpers";

export function IapHintsText({
  hints,
  country,
}: {
  hints: IapHints | null;
  country: StoreCountry;
}) {
  if (country !== "us") {
    return <>4.99 / 9.99 美元价格线索仅适用于美国区</>;
  }
  if (!hints) {
    return <>暂无价格线索</>;
  }
  return (
    <>
      {`4.99 ${formatHint(hints["4.99"])} · 9.99 ${formatHint(hints["9.99"])}`}
    </>
  );
}

export function IapSection({
  hints,
  items,
  country,
}: {
  hints: IapHints | null;
  items: IapItem[];
  country: StoreCountry;
}) {
  return (
    <section className="wx-detail-section">
      <h4>价格线索</h4>
      <p className="wx-iap-hints">
        <IapHintsText hints={hints} country={country} />
      </p>
      {items.length > 0 ? (
        <div className="wx-iap-list">
          {items.map((item) => (
            <div className="wx-iap-row" key={`${item.name}-${item.price}`}>
              <span className="wx-iap-name">{item.name}</span>
              <span className="wx-iap-price">{item.price}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="wx-empty-subtle">未提取到内购价格行。</p>
      )}
    </section>
  );
}
