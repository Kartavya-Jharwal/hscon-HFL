// Pitch scoring and ranking. Pure TypeScript, unit-tested with `bun test`.

export const CRITERIA = ["what", "who", "where", "why", "pitch"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const CRITERIA_LABEL: Record<Criterion, string> = {
  what: "What", who: "Who", where: "Where", why: "Why", pitch: "Pitch",
};
export const MAX_PER_CRITERION = 5;

export interface Team { id: string; number: number; name: string; scores: Record<Criterion, number> }
export interface Ranked extends Team { total: number; rank: number; tied: boolean }

export const emptyScores = (): Record<Criterion, number> => ({ what: 0, who: 0, where: 0, why: 0, pitch: 0 });
export const clampScore = (n: number) => Math.max(0, Math.min(MAX_PER_CRITERION, Math.round(Number.isFinite(n) ? n : 0)));
export const total = (t: Team) => CRITERIA.reduce((s, c) => s + t.scores[c], 0);
export const maxTotal = CRITERIA.length * MAX_PER_CRITERION;

/** Competition ranking: equal totals share a rank (1, 2, 2, 4). Ties are broken for ORDER by pitch score, then team number, but not for rank. */
export function rankTeams(teams: readonly Team[]): Ranked[] {
  const rows = teams.map((t) => ({ ...t, total: total(t) }));
  rows.sort((a, b) => b.total - a.total || b.scores.pitch - a.scores.pitch || a.number - b.number);
  return rows.map((r) => {
    const better = rows.filter((o) => o.total > r.total).length;
    const same = rows.filter((o) => o.total === r.total).length;
    return { ...r, rank: better + 1, tied: same > 1 };
  });
}

export function nextTeamNumber(teams: readonly Team[]): number {
  return teams.reduce((m, t) => Math.max(m, t.number), 0) + 1;
}

export function resultsText(teams: readonly Team[], title = "HSCON mini pitch results"): string {
  const lines = rankTeams(teams).map((r) => `${r.rank}${r.tied ? "=" : "."} #${r.number} ${r.name} (${r.total}/${maxTotal})`);
  return [title, ...lines].join("\n");
}
