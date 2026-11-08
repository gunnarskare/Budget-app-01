"use client";

/** Liten feiring (konfetti). Respekterer «reduser bevegelse». */
export async function celebrate(size: "small" | "big" = "small"): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { default: confetti } = await import("canvas-confetti");
  const colors = ["#5b3fd1", "#8b6cff", "#1baf7a", "#eda100", "#e87ba4", "#2a78d6"];
  if (size === "small") {
    confetti({ particleCount: 40, spread: 60, startVelocity: 28, origin: { y: 0.7 }, colors, disableForReducedMotion: true });
    return;
  }
  const end = Date.now() + 900;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors, disableForReducedMotion: true });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors, disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  confetti({ particleCount: 120, spread: 90, startVelocity: 40, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
}
