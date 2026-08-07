import type { IapHints, IapItem } from "../../shared/types";

function hasPrice(items: IapItem[], price: string) {
  return items.some((item) => item.price === `$${price}` || item.price === price);
}

export async function buildIapHints(items: IapItem[] | null): Promise<IapHints> {
  if (!items) {
    return {
      "4.99": "unavailable",
      "9.99": "unavailable",
      source: "best_effort",
    };
  }

  return {
    "4.99": hasPrice(items, "4.99") ? "found" : "not_found",
    "9.99": hasPrice(items, "9.99") ? "found" : "not_found",
    source: "rendered_page",
  };
}
