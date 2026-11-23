/** Team initials shown in the UI; filters, URLs and API values keep the full name. */
const TEAM_INITIALS: Record<string, string> = {
  巨风: "JF",
  大容: "DR",
  蓝麟: "LL",
  驰猿: "CY",
  JODO: "JD",
  LivChat: "LC",
  灵蜂: "LF",
};

export function teamLabel(team: string): string {
  const known = TEAM_INITIALS[team];
  if (known) return known;
  // shortcut: a new Chinese team shows its full name until it is added above.
  if (/[㐀-鿿]/.test(team)) return team;
  const initials = team
    .split(/[^A-Za-z0-9]+|(?=[A-Z])/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return initials || team;
}
