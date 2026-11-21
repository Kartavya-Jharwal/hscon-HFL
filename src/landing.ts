import event from "../data/event.json";
import { $, h } from "./dom";
import { mountGarden } from "./garden";
import { mountFlowerWordmarks } from "./flowerWordmark";
import { completedGames, type BreakGame } from "./breakTrail";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const gardenContainer = $("#hero-garden");
mountGarden({ container: gardenContainer, decorations: false, duration: 22, seed: 2026 });
mountFlowerWordmarks();

const heroVideo = $<HTMLVideoElement>("#hero-video");
const videoToggle = $<HTMLButtonElement>("#hero-video-toggle");
const syncVideoToggle = () => {
  videoToggle.textContent = heroVideo.paused ? "Play motion" : "Pause motion";
  videoToggle.setAttribute("aria-label", heroVideo.paused ? "Play hero video" : "Pause hero video");
};
if (reducedMotion) {
  heroVideo.autoplay = false;
  heroVideo.pause();
}
heroVideo.addEventListener("play", syncVideoToggle);
heroVideo.addEventListener("pause", syncVideoToggle);
videoToggle.onclick = () => {
  if (heroVideo.paused) void heroVideo.play().catch(syncVideoToggle);
  else heroVideo.pause();
};
syncVideoToggle();

const typeTarget = document.querySelector<HTMLElement>("[data-typewriter]");
if (typeTarget && !reducedMotion) {
  const message = typeTarget.textContent || "";
  typeTarget.setAttribute("aria-label", message);
  typeTarget.textContent = "";
  typeTarget.classList.add("typing");
  let start = 0;
  const type = (now: number) => {
    if (!start) start = now;
    const count = Math.min(message.length, Math.floor(Math.max(0, now - start - 550) / 28));
    typeTarget.textContent = message.slice(0, count);
    if (count < message.length) requestAnimationFrame(type);
    else typeTarget.classList.remove("typing");
  };
  requestAnimationFrame(type);
}

if (!reducedMotion && "IntersectionObserver" in window) {
  const sections = document.querySelectorAll<HTMLElement>(".conference-intro, .programme-section, .experience-section, .partners-section, .resources-section");
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  sections.forEach((section) => { section.classList.add("reveal-section"); observer.observe(section); });
}

$("#agenda-rows").replaceChildren(...event.agenda.map((item, index) => {
  const speaker = item.speaker === "-" ? "" : item.speaker;
  return h("div", { class: `agenda-item${item.highlight ? " featured" : ""}` },
    h("span", { class: "agenda-time" }, item.time.replace("-", "–")),
    h("div", { class: "agenda-content" },
      h("span", { class: "agenda-count" }, String(index + 1).padStart(2, "0")),
      h("h3", {}, item.session),
      speaker ? h("p", {}, speaker) : null),
    item.href ? h("a", { class: "agenda-action", href: item.href, ariaLabel: item.href === "#experience" ? `Play games during ${item.session}` : `Explore ${item.session}` }, item.href === "#experience" ? "Play ↗" : "Explore ↗") : h("span", { class: "agenda-mark", ariaHidden: "true" }, "↗"));
}));

const played = new Set(completedGames());
const gameIds: BreakGame[] = ["wordle", "connections", "cup-toss"];
const moments = ["Start with a word", "Find the connections", "Put it in motion"];
$("#break-collection-status").textContent = `${played.size} of 3 played · Pick up where you left off`;
$("#game-cards").replaceChildren(...event.links.slice(0, 3).map((link, i) =>
  h("a", { class: "game-card", href: link.href },
    h("span", { class: "game-card-number" }, `0${i + 1} / 03`),
    h("span", { class: "game-card-moment" }, moments[i]!),
    h("strong", {}, link.label),
    h("span", {}, link.note),
    h("span", { class: "game-card-action" }, played.has(gameIds[i]!) ? "Played · Play again ↗" : "Play now ↗"))));

const partnerLogos = [
  "hult-founders-lab.png",
  "hult-ai-collective.png",
  "business-of-style.png",
  "hult-asian-society.png",
  "social-impact-club.png",
  "latam-society.png",
  "women-in-business.png",
];
$("#partner-grid").replaceChildren(...event.partners.map((name, i) =>
  h("div", { class: "partner-name" },
    h("img", { class: "partner-logo", src: `assets/${partnerLogos[i]}`, alt: "", loading: "lazy" }),
    h("strong", {}, name))));

const links = [...event.links.slice(3)];
if (event.repo) links.push({ label: "Source code", note: "Games, site and this page", href: event.repo });
$("#links").replaceChildren(...links.map((link) =>
  h("li", {}, link.href
    ? h("a", { href: link.href }, h("b", {}, link.label), h("span", {}, link.note), h("span", { class: "resource-arrow", ariaHidden: "true" }, "↗"))
    : h("div", { class: "soon" }, h("b", {}, `${link.label} (coming soon)`), h("span", {}, link.note)))));

fetch("./health").then((response) => {
  if (!response.ok) return;
  const live = $("#live-links") as HTMLElement;
  live.replaceChildren(
    h("a", { class: "btn primary", href: "host/" }, "Open big screen"),
    h("a", { class: "btn", href: "controller/" }, "Join on a phone"),
  );
  live.hidden = false;
}).catch(() => {});
