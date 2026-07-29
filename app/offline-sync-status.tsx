"use client";

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { processOfflineQueue, useOfflineSyncStatus } from "@/lib/offline-sync";

export function OfflineSyncStatus() {
  const status = useOfflineSyncStatus();

  if (status.online && status.queued === 0 && !status.syncing) return null;

  return (
    <button
      type="button"
      onClick={() => void processOfflineQueue()}
      className={`fixed bottom-20 left-3 z-[70] inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black shadow-xl backdrop-blur lg:bottom-4 ${
        status.online
          ? "border-amber-200 bg-amber-50/95 text-amber-800"
          : "border-rose-200 bg-rose-50/95 text-rose-800"
      }`}
      title={status.lastError || "حالة المزامنة"}
    >
      {status.syncing ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : status.online ? (
        <Cloud className="h-4 w-4" />
      ) : (
        <CloudOff className="h-4 w-4" />
      )}
      <span>
        {status.syncing
          ? "جاري المزامنة"
          : status.online
            ? "بانتظار المزامنة"
            : "بدون إنترنت"}
        {status.queued > 0 ? ` - ${status.queued} عملية منتظرة` : ""}
      </span>
    </button>
  );
}
