"use client";

import { supabase } from "@/lib/supabase";

export type ActiveCashSession = {
  id: string;
  opening_balance: number;
  status: string;
};

export async function getActiveCashSession() {
  const { data, error } = await supabase
    .from("cash_sessions")
    .select("id,opening_balance,status")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data as ActiveCashSession | null) || null;
}

export async function isShiftRequired() {
  const { data, error } = await supabase
    .from("business_settings")
    .select("require_shift_close")
    .eq("id", "main")
    .maybeSingle();

  if (error) return false;
  return data?.require_shift_close !== false;
}

export async function requireOpenShiftForCash(amount: number) {
  if (!amount || amount <= 0) return { ok: true as const, sessionId: null };

  const required = await isShiftRequired();
  if (!required) return { ok: true as const, sessionId: null };

  const session = await getActiveCashSession();
  if (!session) {
    return {
      ok: false as const,
      message: "لا توجد وردية خزنة مفتوحة. افتح وردية من الصفحة الرئيسية قبل حفظ أي حركة نقدية.",
    };
  }

  return { ok: true as const, sessionId: session.id };
}
