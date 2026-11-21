import allPuzzles from "../../data/puzzles.json";
import { $, delay, h } from "../dom";
import { mountGarden } from "../garden";
import { Game, MAX_MISTAKES, decodePuzzle, encodePuzzle, validatePuzzle, type Category, type Puzzle } from "./logic";
import { markGameComplete, mountBreakTrail } from "../breakTrail";

const puzzles = allPuzzles as Puzzle[];
mountBreakTrail("connections");
const garden = mountGarden({ duration: 60, manual: true, startAt: 0.12 });

const els = {
  blurb: $("#blurb"), picker: $<HTMLSelectElement>("#picker"), status: $("#status"), solved: $("#solved"),
  grid: $("#grid"), pips: $("#pips"), shuffle: $<HTMLButtonElement>("#shuffle"), clear: $<HTMLButtonElement>("#clear"),
  submit: $<HTMLButtonElement>("#submit"),
  restart: $<HTMLButtonElement>("#restart"), progress: $("#connections-progress"), selected: $("#connections-selected"),
};

let game: Game;
let busy = false;

function puzzleFromUrl(): Puzzle {
  const params = new URLSearchParams(location.hash.slice(1));
  const shared = params.get("d");
  if (shared) { const p = decodePuzzle(shared); if (p) return p; }
  return puzzles.find((p) => p.id === params.get("p")) ?? puzzles[0]!;
}

function start(p: Puzzle) {
  game = new Game(p);
  busy = false;
  els.blurb.textContent = p.blurb ?? p.title;
  els.status.textContent = "Find the first set of four.";
  garden.growTo(0.12, 600);
  render();
}

function render() {
  els.progress.textContent = game.status === "lost" ? "Answers revealed" : `${game.solved.length} of 4 groups found`;
  els.selected.textContent = `${game.selected.length} of 4 selected`;
  els.solved.replaceChildren(...game.solved.map(solvedRow));
  els.grid.replaceChildren(
    ...game.remaining.map((w) =>
      h("button", {
        class: "tile", type: "button", "aria-pressed": String(game.selected.includes(w)),
        onclick: () => { if (busy) return; game.toggle(w); render(); },
      }, w)),
  );
  els.pips.replaceChildren(
    h("span", {}, "Mistakes left"),
    ...Array.from({ length: MAX_MISTAKES }, (_, i) => h("span", { class: `pip${i >= game.mistakesLeft ? " gone" : ""}` })),
  );
  els.submit.disabled = busy || game.selected.length !== 4 || game.status !== "playing";
  els.shuffle.disabled = els.clear.disabled = busy || game.status !== "playing";
  els.restart.disabled = busy;
}

function solvedRow(c: Category) {
  return h("div", { class: `row-solved lv${c.level}` }, h("b", {}, c.name), h("span", {}, c.words.join(", ")),
    c.insight ? h("p", { class: "group-insight" }, c.insight) : null);
}

function say(msg: string) { els.status.textContent = msg; }

async function submit() {
  if (busy) return;
  const r = game.submit();
  switch (r.kind) {
    case "same": say("Already guessed that one."); break;
    case "one-away": say("One away: three words fit a group. Try one swap."); break;
    case "wrong": say("Not quite. Look for what four words share."); break;
    case "correct": say(`${r.category.name} found!`); garden.growTo(0.12 + 0.88 * (game.solved.length / 4)); break;
    default: return;
  }
  if (r.kind === "wrong" || r.kind === "one-away") {
    busy = true; render();
    document.querySelectorAll<HTMLElement>('.tile[aria-pressed="true"]').forEach((t) => t.classList.add("shake"));
    await delay(420); busy = false;
    game.deselectAll();
  }
  render();
  if (game.status === "won") {
    markGameComplete("connections");
    say(game.mistakes === 0 ? "Perfect! All four ideas connected without a mistake." : "You connected all four ideas.");
  }
  if (game.status === "lost") await reveal();
}

async function reveal() {
  busy = true; say("Out of mistakes. Here are the answers."); render();
  for (const c of game.unsolvedCategories()) {
    await delay(900);
    game.solved = [...game.solved, c];
    game.remaining = game.remaining.filter((w) => !c.words.includes(w));
    render();
  }
  markGameComplete("connections");
  busy = false; render();
}

els.shuffle.onclick = () => { game.shuffle(); render(); };
els.clear.onclick = () => { game.deselectAll(); render(); };
els.submit.onclick = () => void submit();
els.restart.onclick = () => start(game.puzzle);

// Puzzle picker
els.picker.replaceChildren(...puzzles.map((p) => h("option", { value: p.id }, p.title)), h("option", { value: "__custom" }, "Custom (from link)"));
function syncPicker(p: Puzzle) { els.picker.value = puzzles.some((x) => x.id === p.id) ? p.id : "__custom"; }
els.picker.onchange = () => {
  if (els.picker.value === "__custom") return;
  location.hash = `p=${els.picker.value}`;
};
window.addEventListener("hashchange", () => { const p = puzzleFromUrl(); syncPicker(p); start(p); });

// Puzzle builder
const rows = ["Easiest (yellow)", "Easy (green)", "Hard (blue)", "Hardest (red)"].map((label, i) =>
  h("div", { class: "field" },
    h("label", { for: `b-name-${i}` }, `Category ${i + 1}: ${label}`),
    h("input", { type: "text", id: `b-name-${i}`, placeholder: ["Sponsor name or theme", "Another sponsor", "Sustainability keyword", "Anything else"][i] }),
    h("input", { type: "text", id: `b-words-${i}`, placeholder: "word, word, word, word", "aria-label": `Words for category ${i + 1}` })));
$("#builder-rows").replaceChildren(...rows);

$("#builder-make").onclick = () => {
  const categories: Category[] = [0, 1, 2, 3].map((i) => ({
    name: $<HTMLInputElement>(`#b-name-${i}`).value.trim(),
    words: $<HTMLInputElement>(`#b-words-${i}`).value.split(",").map((w) => w.trim()).filter(Boolean),
    level: i as 0 | 1 | 2 | 3,
  }));
  const puzzle: Puzzle = { id: "custom", title: "Sponsor round", blurb: "Group the words by sponsor and theme.", categories };
  const errors = validatePuzzle(puzzle);
  $("#builder-err").textContent = errors.join(" ");
  $("#builder-out").hidden = errors.length > 0;
  if (errors.length) return;
  const url = `${location.origin}${location.pathname}#d=${encodePuzzle(puzzle)}`;
  $<HTMLInputElement>("#builder-url").value = url;
  $<HTMLAnchorElement>("#builder-play").href = `#d=${encodePuzzle(puzzle)}`;
};
$("#builder-copy").onclick = async () => {
  const input = $<HTMLInputElement>("#builder-url");
  try { await navigator.clipboard.writeText(input.value); $("#builder-copy").textContent = "Copied"; }
  catch { input.select(); }
};

const first = puzzleFromUrl();
syncPicker(first);
start(first);
