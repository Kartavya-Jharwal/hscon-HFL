import { describe, expect, test } from "bun:test";
import { WORDS, scoreGuess } from "./logic";

describe("Wordle feedback", () => {
  test("all curated answers fit the five-letter grid", () => {
    expect(WORDS.every((word) => /^[A-Z]{5}$/.test(word))).toBe(true);
  });
  test("marks exact and misplaced letters", () => {
    expect(scoreGuess("SOLAR", "SOLAR")).toEqual(["correct", "correct", "correct", "correct", "correct"]);
    expect(scoreGuess("WATER", "WASTE")).toEqual(["correct", "correct", "present", "present", "absent"]);
  });
  test("does not give extra credit for a duplicate", () => {
    expect(scoreGuess("EERIE", "REUSE")).toEqual(["absent", "correct", "present", "absent", "correct"]);
  });
});
