"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type OfflineSyncAction = "insert" | "update" | "upsert" | "delete";

export type OfflineSyncStep = {
  table: string;
  action: OfflineSyncAction;
  values?: unknown;
  match?: Record<string, string | number | boolean | null>;
  onConflict?: string;
};

export type OfflineSyncJob = {
  id: string;
  label: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  steps: OfflineSyncStep[];
};

export type OfflineSyncSnapshot = {
  online: boolean;
  queued: number;
  syncing: boolean;
  lastError?: string;
};

const DB_NAME = "sys-offline-sync";
const DB_VERSION = 1;
const STORE_NAME = "jobs";
const OFFLINE_SYNC_EVENT = "sys-offline-sync-change";

let syncing = false;
let lastError: string | undefined;
let networkAvailable = typeof navigator === "undefined" ? true : navigator.onLine;

function browserIsOnline() {
  return typeof navigator === "undefined" || navigator.onLine;
}

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
}

function createId(prefix = "offline") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة التخزين المحلية."));
  });
}

async function storeRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = run(transaction.objectStore(STORE_NAME));
    let result: T;
    let settled = false;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      db.close();
      reject(request.error || new Error("تعذر التعامل مع طابور المزامنة."));
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      db.close();
      reject(transaction.error || new Error("تعذر حفظ طابور المزامنة."));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      db.close();
      reject(transaction.error || new Error("تم إلغاء عملية حفظ طابور المزامنة."));
    };
  });
}

export async function getOfflineJobs() {
  if (typeof indexedDB === "undefined") return [];
  return storeRequest<OfflineSyncJob[]>("readonly", (store) => store.getAll());
}

async function putOfflineJob(job: OfflineSyncJob) {
  await storeRequest<IDBValidKey>("readwrite", (store) => store.put(job));
  emitChange();
}

async function deleteOfflineJob(id: string) {
  await storeRequest<undefined>("readwrite", (store) => store.delete(id));
  emitChange();
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return "تعذر تنفيذ المزامنة.";
}

export function isOfflineError(error: unknown) {
  if (!browserIsOnline()) {
    networkAvailable = false;
    emitChange();
    return true;
  }

  const message = errorMessage(error).toLowerCase();
  const offline =
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("load failed") ||
    message.includes("internet") ||
    message.includes("connection");

  if (offline) {
    networkAvailable = false;
    emitChange();
  }

  return offline;
}

async function runStep(step: OfflineSyncStep) {
  if (step.action === "insert") {
    const { error } = await supabase.from(step.table).insert(step.values as never);
    if (error) throw error;
    return;
  }

  if (step.action === "update") {
    let query = supabase.from(step.table).update(step.values as never);
    Object.entries(step.match || {}).forEach(([column, value]) => {
      query = query.eq(column, value);
    });
    const { error } = await query;
    if (error) throw error;
    return;
  }

  if (step.action === "upsert") {
    const { error } = await supabase
      .from(step.table)
      .upsert(
        step.values as never,
        step.onConflict ? { onConflict: step.onConflict } : undefined,
      );
    if (error) throw error;
    return;
  }

  let query = supabase.from(step.table).delete();
  Object.entries(step.match || {}).forEach(([column, value]) => {
    query = query.eq(column, value);
  });

  const { error } = await query;
  if (error) throw error;
}

export async function enqueueOfflineJob(label: string, steps: OfflineSyncStep[]) {
  const job: OfflineSyncJob = {
    id: createId("sync"),
    label,
    createdAt: new Date().toISOString(),
    attempts: 0,
    steps,
  };

  await putOfflineJob(job);
  lastError = undefined;
  return job;
}

export async function processOfflineQueue() {
  if (syncing) return;

  if (!browserIsOnline()) {
    networkAvailable = false;
    emitChange();
    return;
  }

  syncing = true;
  networkAvailable = true;
  lastError = undefined;
  emitChange();

  try {
    const jobs = (await getOfflineJobs()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );

    for (const job of jobs) {
      try {
        for (const step of job.steps) {
          await runStep(step);
        }
        networkAvailable = true;
        lastError = undefined;
        await deleteOfflineJob(job.id);
      } catch (jobError) {
        lastError = errorMessage(jobError);
        if (isOfflineError(jobError)) networkAvailable = false;
        await putOfflineJob({
          ...job,
          attempts: job.attempts + 1,
          lastError,
        });
        break;
      }
    }
  } finally {
    syncing = false;
    emitChange();
  }
}

export async function getOfflineSyncSnapshot(): Promise<OfflineSyncSnapshot> {
  const jobs = await getOfflineJobs();
  return {
    online: browserIsOnline() && networkAvailable,
    queued: jobs.length,
    syncing,
    lastError,
  };
}

export function useOfflineSyncStatus() {
  const [snapshot, setSnapshot] = useState<OfflineSyncSnapshot>({
    online: true,
    queued: 0,
    syncing: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const next = await getOfflineSyncSnapshot();
      if (!cancelled) setSnapshot(next);
    }

    function syncAndRefresh() {
      if (!browserIsOnline()) {
        networkAvailable = false;
        void refresh();
        return;
      }

      void processOfflineQueue().finally(refresh);
    }

    function markOffline() {
      networkAvailable = false;
      void refresh();
    }

    void refresh();
    window.addEventListener(OFFLINE_SYNC_EVENT, refresh);
    window.addEventListener("online", syncAndRefresh);
    window.addEventListener("offline", markOffline);
    const timer = window.setInterval(syncAndRefresh, 30000);
    void processOfflineQueue().finally(refresh);

    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_SYNC_EVENT, refresh);
      window.removeEventListener("online", syncAndRefresh);
      window.removeEventListener("offline", markOffline);
      window.clearInterval(timer);
    };
  }, []);

  return snapshot;
}
