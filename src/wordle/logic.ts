export const WORDS = ["REUSE", "WASTE", "PAPER", "GLASS", "METAL", "SCRAP", "CYCLE", "RENEW"] as const;
export type LetterMark = "correct" | "present" | "absent";

/** Score repeated letters once per occurrence in the answer. */
export function scoreGuess(guess: string, answer: string): LetterMark[] {
  const marks: LetterMark[] = Array(5).fill("absent");
  const remaining = [...answer];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) { marks[i] = "correct"; remaining[i] = ""; }
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === "correct") continue;
    const at = remaining.indexOf(guess[i]!);
    if (at >= 0) { marks[i] = "present"; remaining[at] = ""; }
  }
  return marks;
}
