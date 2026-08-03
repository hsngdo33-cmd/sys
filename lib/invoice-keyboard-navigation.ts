import type { KeyboardEvent } from "react";

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function handleInvoiceArrowNavigation(event: KeyboardEvent<HTMLElement>) {
  if (!ARROW_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const current = event.currentTarget as HTMLElement;
  const currentRect = current.getBoundingClientRect();
  const currentX = currentRect.left + currentRect.width / 2;
  const currentY = currentRect.top + currentRect.height / 2;
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-invoice-cell="true"]'))
    .filter((element) => element !== current && !element.hasAttribute("disabled") && element.offsetParent !== null)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - currentX;
      const dy = y - currentY;
      return { element, dx, dy };
    })
    .filter(({ dx, dy }) => {
      if (event.key === "ArrowRight") return dx > 4;
      if (event.key === "ArrowLeft") return dx < -4;
      if (event.key === "ArrowDown") return dy > 4;
      return dy < -4;
    })
    .sort((a, b) => {
      const horizontal = event.key === "ArrowRight" || event.key === "ArrowLeft";
      const scoreA = horizontal ? Math.abs(a.dx) + Math.abs(a.dy) * 4 : Math.abs(a.dy) + Math.abs(a.dx) * 4;
      const scoreB = horizontal ? Math.abs(b.dx) + Math.abs(b.dy) * 4 : Math.abs(b.dy) + Math.abs(b.dx) * 4;
      return scoreA - scoreB;
    });

  const next = candidates[0]?.element;
  if (!next) return;
  event.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement && next.type !== "checkbox") next.select();
}
