import event from "../../data/event.json";
import { $, h } from "../dom";
import { mountGarden } from "../garden";

const garden = mountGarden({ duration: 3600, manual: true, startAt: 0.02 });
const blocks = event.session.reduce<{ start: number; end: number; title: string; detail: string; kind: string; min: number }[]>((acc, s) => {
  const start = acc.length ? acc[acc.length - 1]!.end : 0;
  acc.push({ ...s, start, end: start + s.min });
  return acc;
}, []);
const totalMin = blocks[blocks.length - 1]!.end;

let elapsed = 0; // seconds
let running = false;
let last = 0;
let timer = 0;

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function render() {
  $("#clock").textContent = `${mmss(elapsed)} / ${totalMin}:00`;
  const idx = blocks.findIndex((b) => elapsed < b.end * 60);
  const cur = idx === -1 ? blocks.length : idx;
  $("#blocks").replaceChildren(...blocks.map((b, i) =>
    h("li", { class: `block ${b.kind}${i === cur ? " now" : ""}${i < cur ? " done" : ""}`, onclick: () => { elapsed = b.start * 60; render(); } },
      h("div", { class: "t" }, `${String(b.start).padStart(2, "0")}–${String(b.end).padStart(2, "0")}`, h("div", { class: "mins" }, `${b.min} min`)),
      h("div", {}, h("h3", {}, b.title), h("span", { class: "muted" }, b.detail)))));
  const next = blocks[cur + 1];
  $("#next").textContent = cur >= blocks.length ? "Session complete." : next ? `Next: ${next.title}` : "Last block.";
  garden.growTo(Math.min(1, 0.02 + (elapsed / (totalMin * 60)) * 0.98), 800);
}

function loop() {
  const now = performance.now();
  elapsed += (now - last) / 1000; last = now;
  render();
}
$("#go").onclick = () => {
  running = !running;
  $("#go").textContent = running ? "Pause" : "Resume";
  if (running) { last = performance.now(); timer = window.setInterval(loop, 1000); } else clearInterval(timer);
};
$("#reset").onclick = () => { running = false; clearInterval(timer); elapsed = 0; $("#go").textContent = "Start"; render(); };
render();
