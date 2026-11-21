import { $ } from "../dom";
import { createPaperToss } from "./game";
import { mountGarden } from "../garden";
import { markGameComplete, mountBreakTrail } from "../breakTrail";

mountBreakTrail("cup-toss");
mountGarden({ duration: 15 });

const score = $("#cup-score");
const best = $("#cup-best");
const message = $("#cup-message");
const phase = $("#cup-phase");
const reset = $<HTMLButtonElement>("#cup-reset");
const reflection = $("#cup-reflection");
let completionRecorded = false;
try {
  const game = createPaperToss($("#cup-game"), {
    onState: (state) => {
      score.textContent = String(state.score); best.textContent = String(state.best);
      phase.textContent = ({ ready: "Ready to toss", aiming: "Aim and flick up", flight: "Cup in flight", scored: "Basket scored", miss: "Try again" })[state.phase];
      if (state.score > 0 || state.best > 0) {
        if (!completionRecorded) { markGameComplete("cup-toss"); completionRecorded = true; }
        reflection.hidden = false;
      }
    },
    onMessage: (text) => { message.textContent = text; },
  });
  reset.onclick = () => { game.reset(); message.textContent = "New run. Flick the cup upward to toss."; };
  window.addEventListener("pagehide", game.destroy, { once: true });
} catch {
  message.textContent = "The 3D game could not start on this device.";
  reset.disabled = true;
}
