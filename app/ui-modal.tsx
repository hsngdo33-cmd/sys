"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";

export function UiModal({
  title,
  description,
  children,
  onClose,
  maxWidth = "max-w-6xl",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6" dir="rtl">
      <div className={`flex max-h-[calc(100vh-2rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-3xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-xl font-black text-slate-950 sm:text-2xl">{title}</h2>
            {description && <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

