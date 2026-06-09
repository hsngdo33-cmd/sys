"use client";

import { supabase } from "@/lib/supabase";
import { StaffSession } from "@/app/staff-session";

export type StaffActivityInput = {
  staff: StaffSession | null;
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  note?: string;
};

export async function recordStaffActivity({
  staff,
  action,
  entityType,
  entityId,
  note,
}: StaffActivityInput) {
  try {
    await supabase.from("staff_activity_logs").insert([
      {
        staff_id: staff?.id || null,
        staff_name: staff?.name || "غير مسجل",
        staff_role: staff?.role || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId == null ? null : String(entityId),
        note: note || null,
      },
    ]);
  } catch (error) {
    console.warn("Failed to record staff activity", error);
  }
}
