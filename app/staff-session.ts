"use client";

import { useEffect, useState } from "react";
import { normalizeStaffRole, StaffRole } from "@/lib/permissions";

const STAFF_SESSION_KEY = "activeStaffSession";
const STAFF_SESSION_EVENT = "staff-session-change";

export type StaffSession = {
  id: string;
  name: string;
  role: StaffRole;
};

function readSession(): StaffSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STAFF_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StaffSession>;
    if (!parsed.id || !parsed.name) return null;
    return {
      id: parsed.id,
      name: parsed.name,
      role: normalizeStaffRole(parsed.role),
    };
  } catch {
    return null;
  }
}

export function saveStaffSession(session: StaffSession) {
  window.localStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
}

export function clearStaffSession() {
  window.localStorage.removeItem(STAFF_SESSION_KEY);
  window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
}

export function useStaffSession() {
  const [staff, setStaff] = useState<StaffSession | null>(null);

  useEffect(() => {
    setStaff(readSession());

    function refresh() {
      setStaff(readSession());
    }

    window.addEventListener(STAFF_SESSION_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STAFF_SESSION_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return staff;
}
