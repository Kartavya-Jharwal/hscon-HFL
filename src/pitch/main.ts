import { $, h, load, save } from "../dom";
import { mountGarden } from "../garden";
import {
  CRITERIA, CRITERIA_LABEL, MAX_PER_CRITERION, clampScore, emptyScores, maxTotal, nextTeamNumber, rankTeams, resultsText, total,
  type Criterion, type Team,
} from "./ranking";

const KEY = "hscon.pitch.v1";
const garden = mountGarden({ duration: 60, manual: true, startAt: 0.15 });
let teams: Team[] = load<Team[]>(KEY, []);
const persist = () => save(KEY, teams);

// Tabs
const tabs = ["teams", "timer", "results"] as const;
function show(name: (typeof tabs)[number]) {
  for (const t of tabs) {
    $(`#tab-${t}`).setAttribute("aria-selected", String(t === name));
    ($(`#panel-${t}`) as HTMLElement).hidden = t !== name;
  }
  if (name === "results") renderResults();
}
tabs.forEach((t) => ($(`#tab-${t}`).onclick = () => show(t)));

// Teams
const numberInput = $<HTMLInputElement>("#add-number");
const nameInput = $<HTMLInputElement>("#add-name");
function resetForm() { numberInput.value = String(nextTeamNumber(teams)); nameInput.value = ""; }

$<HTMLFormElement>("#add-form").onsubmit = (e) => {
  e.preventDefault();
  const number = Math.max(1, Math.floor(Number(numberInput.value) || nextTeamNumber(teams)));
  const name = nameInput.value.trim() || `Team ${number}`;
  teams = [...teams, { id: crypto.randomUUID(), number, name, scores: emptyScores() }];
  persist(); resetForm(); renderTeams(); nameInput.focus();
};

function renderTeams() {
  const list = [...teams].sort((a, b) => a.number - b.number);
  $("#teams").replaceChildren(...list.map(teamCard));
  if (!list.length) $("#teams").append(h("p", { class: "muted" }, "No teams yet. Add the first one above."));
}

function teamCard(t: Team) {
  const tot = h("span", { class: "tot" }, `${total(t)}/${maxTotal}`);
  const steppers = CRITERIA.map((c) => {
    const out = h("output", {}, String(t.scores[c]));
    const set = (n: number) => { t.scores[c] = clampScore(n); out.textContent = String(t.scores[c]); tot.textContent = `${total(t)}/${maxTotal}`; persist(); };
    return h("div", { class: "stepper" }, h("span", {}, CRITERIA_LABEL[c]),
      h("span", { class: "ctl" },
        h("button", { type: "button", "aria-label": `${CRITERIA_LABEL[c]} minus`, onclick: () => set(t.scores[c] - 1) }, "−"),
        out,
        h("button", { type: "button", "aria-label": `${CRITERIA_LABEL[c]} plus`, onclick: () => set(t.scores[c] + 1) }, "+")));
  });
  const name = h("input", { type: "text", value: t.name, "aria-label": `Name for team ${t.number}`, onchange: () => { t.name = name.value.trim() || `Team ${t.number}`; persist(); } });
  return h("div", { class: "team" },
    h("div", { class: "team-head" }, h("span", { class: "num" }, `#${t.number}`), name, tot,
      h("button", { class: "btn small", type: "button", onclick: () => { if (confirm(`Remove ${t.name}?`)) { teams = teams.filter((x) => x.id !== t.id); persist(); renderTeams(); } } }, "Remove")),
    h("div", { class: "steppers" }, ...steppers));
}

// Results
let revealStep = 0;
function renderResults() {
  const ranked = rankTeams(teams);
  $("#rank").replaceChildren(...ranked.map((r) =>
    h("li", {}, h("span", { class: "pos" }, `${r.rank}${r.tied ? "=" : ""}`), h("span", {}, h("b", {}, `#${r.number} `), r.name), h("span", { class: "pts" }, `${r.total}/${maxTotal}`))));
  if (!ranked.length) $("#rank").append(h("li", {}, "No teams yet."));
}

$("#reveal").onclick = () => {
  const ranked = rankTeams(teams);
  const groups = [...new Set(ranked.map((r) => r.rank))].filter((r) => r <= 3).sort((a, b) => b - a);
  if (!groups.length) return;
  if (revealStep >= groups.length) { revealStep = 0; $("#podium").replaceChildren(); garden.growTo(0.15, 500); }
  const rank = groups[revealStep]!;
  const slot = h("div", { class: `slot r${rank}` },
    h("div", { class: "medal" }, rank === 1 ? "Winner" : rank === 2 ? "Second place" : "Third place"),
    ...ranked.filter((r) => r.rank === rank).map((r) => h("div", { class: "big" }, `#${r.number} ${r.name}`)),
    h("div", {}, `${ranked.find((r) => r.rank === rank)!.total} points`));
  $("#podium").prepend(slot);
  garden.growTo(0.15 + 0.85 * ((revealStep + 1) / groups.length));
  revealStep += 1;
  $("#reveal").textContent = revealStep >= groups.length ? "Start over" : "Reveal next";
};
$("#copy").onclick = async () => {
  try { await navigator.clipboard.writeText(resultsText(teams)); $("#copy").textContent = "Copied"; setTimeout(() => ($("#copy").textContent = "Copy results"), 1500); }
  catch { prompt("Copy the results:", resultsText(teams)); }
};
$("#copy-link").onclick = async () => {
  const snapshot = rankTeams(teams).map(({ rank, number, name, total: points }) => ({ rank, number, name, points }));
  const url = `${location.origin}${location.pathname}#view=${encodeURIComponent(JSON.stringify(snapshot))}`;
  try { await navigator.clipboard.writeText(url); $("#copy-link").textContent = "Visitor link copied"; }
  catch { prompt("Copy the visitor link:", url); }
};
$("#wipe").onclick = () => { if (confirm("Clear all teams and scores?")) { teams = []; persist(); revealStep = 0; $("#podium").replaceChildren(); renderTeams(); renderResults(); resetForm(); } };

// Timer
const face = $("#timer-face");
const toggle = $("#timer-toggle");
const DEFAULT_MS = 20 * 60 * 1000;
let remaining = DEFAULT_MS;
let endAt = 0;
let tick = 0;
const fmt = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
function paint() {
  face.textContent = fmt(remaining);
  face.classList.toggle("low", remaining <= 60_000 && remaining > 0);
  face.classList.toggle("done", remaining <= 0);
  document.title = tick ? `${fmt(remaining)} · HSCON Pitch` : "HSCON Pitch scoreboard";
}
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => { const o = ctx.createOscillator(); o.frequency.value = 880; o.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2); });
  } catch { /* audio is optional */ }
}
function stop() { clearInterval(tick); tick = 0; toggle.textContent = remaining > 0 ? "Resume" : "Start"; }
toggle.onclick = () => {
  if (tick) { stop(); paint(); return; }
  if (remaining <= 0) remaining = DEFAULT_MS;
  endAt = Date.now() + remaining;
  toggle.textContent = "Pause";
  tick = window.setInterval(() => {
    remaining = endAt - Date.now();
    if (remaining <= 0) { remaining = 0; stop(); toggle.textContent = "Start"; beep(); }
    paint();
  }, 250);
};
$("#timer-reset").onclick = () => { stop(); remaining = DEFAULT_MS; toggle.textContent = "Start"; paint(); };
const adjust = (ms: number) => { remaining = Math.max(0, remaining + ms); if (tick) endAt += ms; paint(); };
$("#timer-plus").onclick = () => adjust(60_000);
$("#timer-minus").onclick = () => adjust(-60_000);

resetForm(); renderTeams(); paint();

const shared = new URLSearchParams(location.hash.slice(1)).get("view");
if (shared) {
  try {
    const rows = JSON.parse(shared) as { rank: number; number: number; name: string; points: number }[];
    if (!Array.isArray(rows) || !rows.every((r) => Number.isInteger(r.rank) && Number.isInteger(r.number) && typeof r.name === "string" && Number.isFinite(r.points))) throw new Error("Invalid results");
    $(".tabs").remove();
    tabs.forEach((t) => $(`#panel-${t}`).remove());
    $("main").append(h("p", { class: "lead" }, "Shared pitch results"),
      h("ol", { class: "rank" }, ...rows.map((r) => h("li", {},
        h("span", { class: "pos" }, String(r.rank)),
        h("span", {}, `#${r.number} ${r.name}`),
        h("span", { class: "pts" }, `${r.points}/${maxTotal}`)))));
  } catch { /* Keep the host view if the link is malformed. */ }
}
