import { describe, expect, test } from "bun:test";
import { Game, decodePuzzle, encodePuzzle, validatePuzzle, type Puzzle } from "./logic";
import puzzles from "../../data/puzzles.json";

const p = puzzles[0] as Puzzle;
const pick = (g: Game, words: string[]) => { g.deselectAll(); words.forEach((w) => g.toggle(w)); return g.submit(); };

describe("puzzles.json", () => {
  test("every bundled puzzle is valid", () => {
    for (const x of puzzles) expect(validatePuzzle(x as Puzzle)).toEqual([]);
  });
});

describe("Game", () => {
  test("correct group is removed and recorded", () => {
    const g = new Game(p);
    const r = pick(g, p.categories[0]!.words);
    expect(r.kind).toBe("correct");
    expect(g.remaining.length).toBe(12);
    expect(g.solved.length).toBe(1);
  });
  test("one-away costs a mistake", () => {
    const g = new Game(p);
    const r = pick(g, [...p.categories[0]!.words.slice(0, 3), p.categories[1]!.words[0]!]);
    expect(r.kind).toBe("one-away");
    expect(g.mistakesLeft).toBe(3);
  });
  test("repeat guess is flagged and free", () => {
    const g = new Game(p);
    const bad = [p.categories[0]!.words[0]!, p.categories[1]!.words[0]!, p.categories[2]!.words[0]!, p.categories[3]!.words[0]!];
    pick(g, bad);
    expect(pick(g, bad).kind).toBe("same");
    expect(g.mistakes).toBe(1);
  });
  test("selection caps at four and incomplete submit is ignored", () => {
    const g = new Game(p);
    g.remaining.slice(0, 6).forEach((w) => g.toggle(w));
    expect(g.selected.length).toBe(4);
    g.toggle(g.selected[0]!);
    expect(g.submit().kind).toBe("incomplete");
  });
  test("win after four groups, loss after four mistakes", () => {
    const g = new Game(p);
    p.categories.forEach((c) => pick(g, c.words));
    expect(g.status).toBe("won");

    const l = new Game(p);
    const mixes = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => p.categories[(j + i) % 4]!.words[j]!));
    mixes.forEach((m) => pick(l, m));
    expect(l.status).toBe("lost");
    expect(l.unsolvedCategories().length).toBe(4);
  });
  test("lookup is case and whitespace insensitive", () => {
    const g = new Game(p);
    p.categories[0]!.words.forEach((w) => g.toggle(` ${w.toLowerCase()} `));
    expect(g.submit().kind).toBe("correct");
  });
});

describe("validation and sharing", () => {
  test("rejects duplicates and wrong sizes", () => {
    const bad: Puzzle = JSON.parse(JSON.stringify(p));
    bad.categories[1]!.words[0] = bad.categories[0]!.words[0]!;
    expect(validatePuzzle(bad).length).toBeGreaterThan(0);
    expect(validatePuzzle({ ...p, categories: p.categories.slice(0, 3) }).length).toBe(1);
  });
  test("encode/decode round-trips, including non-ASCII", () => {
    const q: Puzzle = JSON.parse(JSON.stringify(p));
    q.categories[0]!.name = "Café ♻ sponsors";
    expect(decodePuzzle(encodePuzzle(q))).toEqual(q);
    expect(decodePuzzle("not-a-puzzle")).toBeNull();
  });
});
