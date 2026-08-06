"use client";

import { useEffect } from "react";

export function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫،]/g, ".")
    .replace(/٬/g, "");
}

function isNumericInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && (
    target.type === "number" || target.inputMode === "numeric" || target.inputMode === "decimal"
  );
}

function acceptsDigitNormalization(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && ["text", "search", "tel", "password", "number", "email", "url"].includes(target.type);
}

function updateInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(input: HTMLInputElement, text: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  updateInput(input, `${input.value.slice(0, start)}${text}${input.value.slice(end)}`);
  window.setTimeout(() => {
    try {
      input.setSelectionRange(start + text.length, start + text.length);
    } catch {
      // Number inputs do not expose a text selection range.
    }
  });
}

export function NumericInputBehavior() {
  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      if (!isNumericInput(event.target)) return;
      const input = event.target;
      if (input.value !== "" && Number(input.value) === 0) updateInput(input, "");
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!acceptsDigitNormalization(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const normalized = normalizeDigits(event.key);
      if (normalized === event.key || normalized.length !== 1) return;
      event.preventDefault();
      insertText(event.target, normalized);
    };

    const handleBeforeInput = (event: InputEvent) => {
      if (!acceptsDigitNormalization(event.target) || !event.data || !event.inputType.startsWith("insert")) return;
      const normalized = normalizeDigits(event.data);
      if (normalized === event.data) return;
      event.preventDefault();
      insertText(event.target, normalized);
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!acceptsDigitNormalization(event.target)) return;
      const pasted = event.clipboardData?.getData("text") || "";
      const normalized = normalizeDigits(pasted);
      if (normalized === pasted) return;
      event.preventDefault();
      insertText(event.target, normalized);
    };

    const handleInput = (event: Event) => {
      if (!acceptsDigitNormalization(event.target)) return;
      const normalized = normalizeDigits(event.target.value);
      if (normalized !== event.target.value) updateInput(event.target, normalized);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== "number") return;
      if (document.activeElement !== event.target) return;
      event.preventDefault();
    };

    document.addEventListener("focusin", handleFocus, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("beforeinput", handleBeforeInput as EventListener, true);
    document.addEventListener("paste", handlePaste, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => {
      document.removeEventListener("focusin", handleFocus, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("beforeinput", handleBeforeInput as EventListener, true);
      document.removeEventListener("paste", handlePaste, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("wheel", handleWheel, true);
    };
  }, []);

  return null;
}
