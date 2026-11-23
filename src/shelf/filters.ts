import { useSearchParams } from "react-router";

export type ShelfFilters = {
  team: string | null;
};

const MAX_TEAM_LENGTH = 255;

/** `?team=` is the only shelf query parameter; invalid values are ignored. */
export function readShelfFilters(params: URLSearchParams): ShelfFilters {
  const team = params.get("team")?.trim() ?? "";
  if (!team || team.length > MAX_TEAM_LENGTH) return { team: null };
  return { team };
}

/** Copy `current` with the team filter applied; null/empty removes it. */
export function applyShelfFilters(current: URLSearchParams, patch: Partial<ShelfFilters>): URLSearchParams {
  const next = new URLSearchParams(current);
  if ("team" in patch) {
    if (patch.team) next.set("team", patch.team);
    else next.delete("team");
  }
  return next;
}

/** The only query seam for the shelf page; writes replace history entries. */
export function useShelfFilters() {
  const [params, setParams] = useSearchParams();
  const filters = readShelfFilters(params);

  const update = (patch: Partial<ShelfFilters>) =>
    setParams((current) => applyShelfFilters(current, patch), { replace: true });
  const clear = () => update({ team: null });

  return { filters, update, clear };
}
