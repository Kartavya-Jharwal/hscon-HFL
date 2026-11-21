// Connections game rules. Pure TypeScript, no DOM, so it is unit-tested with `bun test`.
// Rules adapted from srefsland/nyt-connections-clone (MIT, (c) 2024 Simen Refsland).

export type Level = 0 | 1 | 2 | 3; // 0 = easiest ... 3 = hardest
export interface Category { name: string; words: string[]; level: Level; insight?: string }
export interface Puzzle { id: string; title: string; blurb?: string; categories: Category[] }

export type GuessResult =
  | { kind: "incomplete" }
  | { kind: "same" }
  | { kind: "wrong" }
  | { kind: "one-away" }
  | { kind: "correct"; category: Category };

export const MAX_MISTAKES = 4;
const norm = (w: string) => w.trim().toUpperCase();

export function validatePuzzle(p: Puzzle): string[] {
  const errors: string[] = [];
  if (!p.categories || p.categories.length !== 4) return ["A puzzle needs exactly 4 categories."];
  const seen = new Set<string>();
  p.categories.forEach((c, i) => {
    if (!c.name?.trim()) errors.push(`Category ${i + 1} needs a name.`);
    if (!c.words || c.words.length !== 4) errors.push(`Category ${i + 1} needs exactly 4 words.`);
    for (const w of c.words ?? []) {
      const k = norm(w);
      if (!k) errors.push(`Category ${i + 1} has an empty word.`);
      else if (seen.has(k)) errors.push(`"${k}" appears more than once.`);
      seen.add(k);
    }
  });
  return errors;
}

export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class Game {
  remaining: string[];
  selected: string[] = [];
  solved: Category[] = [];
  mistakes = 0;
  status: "playing" | "won" | "lost" = "playing";
  private guesses = new Set<string>();

  constructor(public readonly puzzle: Puzzle, private rng: () => number = Math.random) {
    const errors = validatePuzzle(puzzle);
    if (errors.length) throw new Error(errors.join(" "));
    this.remaining = shuffle(puzzle.categories.flatMap((c) => c.words.map(norm)), rng);
  }

  get mistakesLeft() { return MAX_MISTAKES - this.mistakes; }

  toggle(word: string): void {
    if (this.status !== "playing") return;
    const w = norm(word);
    if (!this.remaining.includes(w)) return;
    if (this.selected.includes(w)) this.selected = this.selected.filter((s) => s !== w);
    else if (this.selected.length < 4) this.selected = [...this.selected, w];
  }

  deselectAll(): void { this.selected = []; }
  shuffle(): void { this.remaining = shuffle(this.remaining, this.rng); }

  submit(): GuessResult {
    if (this.status !== "playing" || this.selected.length !== 4) return { kind: "incomplete" };
    const key = [...this.selected].sort().join("|");
    if (this.guesses.has(key)) return { kind: "same" };
    this.guesses.add(key);

    const unsolved = this.puzzle.categories.filter((c) => !this.solved.includes(c));
    const best = unsolved
      .map((c) => ({ c, hits: c.words.filter((w) => this.selected.includes(norm(w))).length }))
      .sort((a, b) => b.hits - a.hits)[0]!;

    if (best.hits === 4) {
      this.solved = [...this.solved, best.c];
      this.remaining = this.remaining.filter((w) => !this.selected.includes(w));
      this.selected = [];
      if (this.solved.length === 4) this.status = "won";
      return { kind: "correct", category: best.c };
    }
    this.mistakes += 1;
    if (this.mistakes >= MAX_MISTAKES) this.status = "lost";
    return { kind: best.hits === 3 ? "one-away" : "wrong" };
  }

  /** On a loss, categories still unsolved, easiest first, to reveal one by one. */
  unsolvedCategories(): Category[] {
    return this.puzzle.categories.filter((c) => !this.solved.includes(c)).sort((a, b) => a.level - b.level);
  }

  solveAll(): void {
    this.solved = [...this.solved, ...this.unsolvedCategories()];
    this.remaining = [];
    this.selected = [];
  }
}

// Share a custom puzzle as a URL-safe string, so no server is needed.
export function encodePuzzle(p: Puzzle): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePuzzle(s: string): Puzzle | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Puzzle;
    return validatePuzzle(p).length ? null : p;
  } catch {
    return null;
  }
}
