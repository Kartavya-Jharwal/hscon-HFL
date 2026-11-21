import { h } from "./dom";

export type BreakGame = "wordle" | "connections" | "cup-toss";
const KEY = "hscon.break-trail.v1";
const steps: { id: BreakGame; label: string; href: string }[] = [
  { id: "wordle", label: "Wordle", href: "../wordle/" },
  { id: "connections", label: "Connections", href: "../connections/" },
  { id: "cup-toss", label: "Paper Toss", href: "../cup-toss/" },
];

export function completedGames(): BreakGame[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? steps.map((step) => step.id).filter((id) => value.includes(id)) : [];
  } catch { return []; }
}

export function markGameComplete(id: BreakGame): void {
  const completed = new Set(completedGames());
  if (completed.has(id)) return;
  completed.add(id);
  try { localStorage.setItem(KEY, JSON.stringify([...completed])); } catch { /* private browsing still plays */ }
  document.querySelectorAll<HTMLElement>("[data-break-trail]").forEach((node) => renderBreakTrail(node, id));
}

export function renderBreakTrail(container: HTMLElement, current?: BreakGame): void {
  const completed = new Set(completedGames());
  container.replaceChildren(
    h("div", { class: "break-trail-heading" },
      h("span", {}, "The break collection"),
      h("span", {}, `${completed.size} / 3 played`)),
    h("nav", { class: "break-trail-steps", ariaLabel: "Breakfast and lunch games" },
      ...steps.map((step, index) => h("a", {
        href: step.href, class: `break-step${current === step.id ? " current" : ""}${completed.has(step.id) ? " complete" : ""}`,
        ariaCurrent: current === step.id ? "page" : undefined,
      }, h("span", { class: "break-step-number" }, completed.has(step.id) ? "✓" : String(index + 1).padStart(2, "0")),
      h("span", {}, step.label)))));
}

export function mountBreakTrail(current: BreakGame): void {
  const main = document.querySelector("main");
  if (!main) return;
  const container = h("div", { class: "break-trail", "data-break-trail": "" });
  main.prepend(container);
  renderBreakTrail(container, current);
}
