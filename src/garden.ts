import { Garten } from "garten";
import event from "../data/event.json";
import { mountFlowerWordmarks } from "./flowerWordmark";

export const ACCENT = "#d62839";

export interface GardenHandle {
  /** Grow smoothly to a fraction (0..1) of the full garden. */
  growTo(fraction: number, ms?: number): void;
  garden: Garten | null;
}

/** Mounts Garten in the page background, or in a supplied section container. */
export function mountGarden(opts: { duration?: number; seed?: number; startAt?: number; manual?: boolean; container?: HTMLElement; decorations?: boolean } = {}): GardenHandle {
  if (opts.decorations !== false && !document.querySelector("#name") && !document.querySelector(".page-bloom")) {
    const bloom = document.createElement("p");
    bloom.className = "page-bloom";
    bloom.dataset.flowerWordmark = "hero";
    bloom.textContent = "Closing the Loop";
    document.querySelector("main")?.before(bloom);
  }
  if (opts.decorations !== false) {
    mountFlowerWordmarks();
    let marquee = document.querySelector<HTMLElement>(".partner-marquee");
    if (!marquee) {
      marquee = document.createElement("div");
      marquee.className = "partner-marquee";
      marquee.setAttribute("aria-label", "Official partners");
      document.body.prepend(marquee);
    }
    const track = document.createElement("div");
    track.className = "partner-track";
    for (let copy = 0; copy < 2; copy++) {
      const group = document.createElement("div");
      group.className = "partner-group";
      if (copy) group.setAttribute("aria-hidden", "true");
      for (const name of event.partners) {
        const span = document.createElement("span");
        span.textContent = name;
        group.append(span);
      }
      track.append(group);
    }
    marquee.replaceChildren(track);
  }
  const duration = opts.duration ?? 90;
  let el = opts.container ?? document.getElementById("garden");
  if (!el) { el = document.createElement("div"); el.id = "garden"; el.setAttribute("aria-hidden", "true"); document.body.prepend(el); }
  let garden: Garten | null = null;
  try {
    garden = new Garten({
      container: el,
      duration,
      generations: 30,
      maxHeight: 0.75,
      density: "dense",
      categories: ["rose", "tulip", "daisy", "wildflower", "fern"],
      seed: opts.seed ?? 2111,
      autoplay: !opts.manual && !matchMedia("(prefers-reduced-motion: reduce)").matches,
      loop: false,
      targetFPS: 30,
      colors: { accent: ACCENT, palette: "natural", accentWeight: 0.55,
        flowerColors: [ACCENT, "#e88479", "#f0c5a9", "#e9d790"],
        foliageColors: ["#285b3d", "#3e7950", "#6a8d5a"] },
      zIndex: 0,
    });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) garden.seek(duration);
    else if (opts.manual && opts.startAt) garden.seek(opts.startAt * duration);
  } catch (e) {
    console.warn("Garten unavailable", e);
  }
  let raf = 0;
  return {
    garden,
    growTo(fraction, ms = 1400) {
      if (!garden) return;
      cancelAnimationFrame(raf);
      garden.pause();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { garden.seek(duration); return; }
      const from = garden.getProgress();
      const to = Math.max(0, Math.min(1, fraction));
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        const eased = 1 - Math.pow(1 - k, 3);
        garden!.seek((from + (to - from) * eased) * duration);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
  };
}
