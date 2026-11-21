import { describe, expect, test } from "bun:test";
import { CRITERIA, clampScore, emptyScores, nextTeamNumber, rankTeams, resultsText, total, type Team } from "./ranking";

const team = (number: number, name: string, s: number[]): Team => ({
  id: String(number), number, name,
  scores: Object.fromEntries(CRITERIA.map((c, i) => [c, s[i] ?? 0])) as Team["scores"],
});

describe("ranking", () => {
  test("orders by total, highest first", () => {
    const r = rankTeams([team(1, "A", [1, 1, 1, 1, 1]), team(2, "B", [5, 5, 5, 5, 5]), team(3, "C", [3, 3, 3, 3, 3])]);
    expect(r.map((x) => x.name)).toEqual(["B", "C", "A"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
  test("ties share a rank and the next rank skips", () => {
    const r = rankTeams([team(1, "A", [4, 4, 4, 4, 4]), team(2, "B", [4, 4, 4, 4, 4]), team(3, "C", [1, 1, 1, 1, 1])]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
    expect(r[0]!.tied).toBe(true);
    expect(r[2]!.tied).toBe(false);
  });
  test("tie order favours the better pitch score", () => {
    const r = rankTeams([team(1, "A", [5, 5, 5, 0, 0]), team(2, "B", [3, 3, 2, 2, 5])]);
    expect(total(r[0]!)).toBe(total(r[1]!));
    expect(r[0]!.name).toBe("B");
    expect(r.every((x) => x.rank === 1)).toBe(true);
  });
  test("helpers", () => {
    expect(clampScore(9)).toBe(5);
    expect(clampScore(-2)).toBe(0);
    expect(clampScore(NaN)).toBe(0);
    expect(nextTeamNumber([])).toBe(1);
    expect(nextTeamNumber([team(4, "x", [])])).toBe(5);
    expect(total({ id: "x", number: 1, name: "x", scores: emptyScores() })).toBe(0);
    expect(resultsText([team(7, "Seedlings", [5, 5, 5, 5, 5])])).toContain("1. #7 Seedlings (25/25)");
  });
});
