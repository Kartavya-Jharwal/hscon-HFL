/** Small canvas blooms that grow through the HSCON / Closing the Loop lettering. */
export function mountFlowerWordmarks(): void {
  const brand = document.querySelector<HTMLAnchorElement>(".brand");
  if (brand && !brand.querySelector(".brand-title")) {
    brand.replaceChildren();
    const title = document.createElement("span");
    title.className = "brand-title";
    title.textContent = "HSCON";
    const sub = document.createElement("span");
    sub.className = "brand-sub";
    sub.textContent = "Closing the Loop";
    brand.append(title, sub);
    brand.dataset.flowerWordmark = "small";
    brand.setAttribute("aria-label", "HSCON, Closing the Loop, Home");
  }

  for (const element of document.querySelectorAll<HTMLElement>("[data-flower-wordmark]")) {
    if (element.querySelector(".flower-canvas")) continue;
    if (element !== brand && element.childElementCount === 0) {
      const lettering = document.createElement("span");
      lettering.className = "bloom-lettering";
      lettering.textContent = element.textContent;
      element.replaceChildren(lettering);
    }
    const canvas = document.createElement("canvas");
    canvas.className = "flower-canvas";
    canvas.setAttribute("aria-hidden", "true");
    element.prepend(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const small = element.dataset.flowerWordmark === "small";
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let width = 0, height = 0, frame = 0;

    const resize = () => {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(performance.now());
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      const count = small ? 5 : Math.min(8, Math.max(3, Math.round(width / 75)));
      const size = small ? 4.4 : Math.min(10, Math.max(5, width / 70));
      for (let i = 0; i < count; i++) {
        const x = width * (i + 0.55) / count;
        const rise = (Math.sin(i * 9.7) + 1) * 0.16 + 0.42;
        const bloomY = height * (1 - rise);
        const baseY = height * (small ? 0.88 : 0.96);
        const progress = reduced ? 1 : Math.max(0, Math.min(1, (now - started - i * 85) / 1100));
        const eased = 1 - (1 - progress) ** 3;
        const endY = baseY + (bloomY - baseY) * eased;
        ctx.strokeStyle = i % 2 ? "#336b4b" : "#477d54";
        ctx.lineWidth = small ? 1.1 : 1.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + size * 0.5, baseY);
        ctx.quadraticCurveTo(x - size * 1.2, (baseY + endY) / 2, x, endY);
        ctx.stroke();
        if (progress < 0.38) continue;
        const bloom = Math.min(1, (progress - 0.38) / 0.62);
        const petal = size * bloom;
        ctx.fillStyle = i % 3 === 0 ? "#d62839" : i % 3 === 1 ? "#e88479" : "#b93446";
        for (let p = 0; p < 5; p++) {
          const angle = p * Math.PI * 2 / 5 - Math.PI / 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(angle) * petal * 0.7, endY + Math.sin(angle) * petal * 0.7,
            petal * 0.72, petal * 0.45, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#eec969";
        ctx.beginPath(); ctx.arc(x, endY, petal * 0.35, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduced && now - started < 2200) frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(element);
    frame = requestAnimationFrame(draw);
    window.addEventListener("pagehide", () => { cancelAnimationFrame(frame); observer.disconnect(); }, { once: true });
  }
}
