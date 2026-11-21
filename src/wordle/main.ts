import { $, h, load, save } from "../dom";
import { mountGarden } from "../garden";
import { WORDS, scoreGuess, type LetterMark } from "./logic";
import { markGameComplete, mountBreakTrail } from "../breakTrail";

const KEY = "hscon.wordle.v2";
const clues: Record<typeof WORDS[number], string> = {
  REUSE: "Choose another use before making something new.",
  WASTE: "The resource we try to design out of a system.",
  PAPER: "A fibre-based material that can enter another cycle.",
  GLASS: "A material that can be collected and remade.",
  METAL: "A durable material often recovered from products.",
  SCRAP: "Useful offcuts left after making something.",
  CYCLE: "A loop of use, recovery and renewal.",
  RENEW: "To restore or make useful again.",
};
mountBreakTrail("wordle");
const garden = mountGarden({ duration: 60, manual: true, startAt: .16 });
const grid = $("#wordle-grid");
const keyboard = $("#wordle-keyboard");
const input = $<HTMLInputElement>("#wordle-guess");
const form = $<HTMLFormElement>("#wordle-form");
const status = $("#wordle-status");
const progress = $("#wordle-progress");
const nextButton = $<HTMLButtonElement>("#wordle-new");
const clue = $("#wordle-clue");
const clueButton = $<HTMLButtonElement>("#wordle-hint");

type Round = { word: string; guesses: string[]; round: number };
const stored = load<Round | null>(KEY, null);
let state: Round = stored && WORDS.includes(stored.word as typeof WORDS[number]) &&
  Array.isArray(stored.guesses) && stored.guesses.every((g) => /^[A-Z]{5}$/.test(g)) && stored.guesses.length <= 6
  ? stored : { word: WORDS[Math.floor(Math.random() * WORDS.length)]!, guesses: [], round: 1 };

const outcome = () => state.guesses.includes(state.word) ? "won" : state.guesses.length >= 6 ? "lost" : "playing";
const persist = () => save(KEY, state);
if (state.guesses.length && outcome() === "playing") status.textContent = `${6 - state.guesses.length} guesses left.`;

function render() {
  const done = outcome() !== "playing";
  const current = input.value.toUpperCase().slice(0, 5);
  grid.replaceChildren(...Array.from({ length: 6 }, (_, row) => {
    const guess = state.guesses[row] ?? (row === state.guesses.length && !done ? current : "");
    const marks = row < state.guesses.length ? scoreGuess(guess, state.word) : [];
    return h("div", { class: `wordle-row${row === state.guesses.length && !done ? " active" : ""}`, role: "row" },
      ...Array.from({ length: 5 }, (_, i) => h("span", { class: `wordle-cell ${marks[i] ?? ""}`, role: "gridcell" }, guess[i] ?? "")));
  }));
  const priority: Record<LetterMark, number> = { absent: 1, present: 2, correct: 3 };
  const keyMarks = new Map<string, LetterMark>();
  state.guesses.forEach((guess) => scoreGuess(guess, state.word).forEach((mark, i) => {
    const letter = guess[i]!;
    if (!keyMarks.has(letter) || priority[mark] > priority[keyMarks.get(letter)!]) keyMarks.set(letter, mark);
  }));
  keyboard.replaceChildren(...["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row) =>
    h("div", { class: "keyboard-row" }, ...[...row].map((letter) => h("button", {
      type: "button", class: `key ${keyMarks.get(letter) ?? ""}`, "aria-label": letter, disabled: done,
      onclick: () => { if (!done && input.value.length < 5) { input.value += letter; render(); } },
    }, letter)))));
  input.disabled = done;
  ($<HTMLButtonElement>("#wordle-back")).disabled = done;
  ($<HTMLButtonElement>("#wordle-enter")).disabled = done;
  progress.textContent = `Round ${state.round} · ${Math.min(state.guesses.length + (done ? 0 : 1), 6)} of 6 guesses`;
  nextButton.textContent = done ? "Play another word" : "New word";
  if (done) status.textContent = outcome() === "won"
    ? `Solved in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}! ${clues[state.word as typeof WORDS[number]]}`
    : `The word was ${state.word}. ${clues[state.word as typeof WORDS[number]]}`;
  if (done) markGameComplete("wordle");
  garden.growTo(.16 + .84 * state.guesses.length / 6);
}

input.oninput = () => { input.value = input.value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 5); render(); };
form.onsubmit = (event) => {
  event.preventDefault();
  if (outcome() !== "playing") return;
  const guess = input.value.trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(guess)) { status.textContent = "Enter five letters to make a guess."; input.focus(); return; }
  state.guesses.push(guess); input.value = ""; persist();
  if (outcome() === "playing") status.textContent = `${6 - state.guesses.length} guesses left.`;
  render();
};
nextButton.onclick = () => {
  if (state.guesses.length && outcome() === "playing" && !confirm("Start a new word and leave this round?")) return;
  const choices = WORDS.filter((word) => word !== state.word);
  state = { word: choices[Math.floor(Math.random() * choices.length)]!, guesses: [], round: state.round + 1 };
  input.value = ""; status.textContent = "A new word is ready."; clue.hidden = true; clueButton.textContent = "Need a clue?"; clueButton.setAttribute("aria-expanded", "false"); persist(); render();
};
clueButton.onclick = () => {
  clue.hidden = !clue.hidden;
  clue.textContent = clues[state.word as typeof WORDS[number]];
  clueButton.textContent = clue.hidden ? "Need a clue?" : "Hide clue";
  clueButton.setAttribute("aria-expanded", String(!clue.hidden));
};
$("#wordle-back").onclick = () => { if (outcome() === "playing") { input.value = input.value.slice(0, -1); render(); } };
$("#wordle-enter").onclick = () => form.requestSubmit();
persist(); render();
