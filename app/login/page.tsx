"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogIn, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizeStaffRole, roleLabels } from "@/lib/permissions";
import { saveStaffSession } from "@/app/staff-session";
import { recordStaffActivity } from "@/app/staff-activity";

type StaffLoginRow = {
  id: string;
  name: string;
  role: string;
  pin_code: string | null;
  is_active: boolean;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "تعذر تحميل بيانات الموظفين.";
}

export default function StaffLoginPage() {
  const router = useRouter();
  const [staffRows, setStaffRows] = useState<StaffLoginRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStaff = useMemo(
    () => staffRows.find((staff) => staff.id === selectedId) || null,
    [selectedId, staffRows],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStaff() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("staff_members")
          .select("id,name,role,pin_code,is_active")
          .eq("is_active", true)
          .order("name");

        if (loadError) throw loadError;
        if (cancelled) return;

        const rows = (data || []) as StaffLoginRow[];
        setStaffRows(rows);
        setSelectedId(rows[0]?.id || "");
      } catch (loadError) {
        if (!cancelled) setError(`${getErrorMessage(loadError)} شغل ملف supabase-professional-upgrade.sql لو الجدول غير موجود.`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStaff();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login() {
    if (!selectedStaff) {
      setError("اختار الموظف الأول.");
      return;
    }

    if (!selectedStaff.pin_code) {
      setError("الموظف ده ملوش كود دخول. افتح الإعدادات واضف كود دخول له.");
      return;
    }

    if (selectedStaff.pin_code !== pinCode.trim()) {
      setError("كود الدخول غير صحيح.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await supabase
        .from("staff_members")
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", selectedStaff.id);

      const session = {
        id: selectedStaff.id,
        name: selectedStaff.name,
        role: normalizeStaffRole(selectedStaff.role),
      };

      saveStaffSession(session);
      await recordStaffActivity({
        staff: session,
        action: "staff_login",
        entityType: "staff_member",
        entityId: selectedStaff.id,
        note: "تسجيل دخول للموظف",
      });

      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] text-right" dir="rtl">
      <div className="mx-auto max-w-xl">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-600">دخول الموظفين</p>
              <h1 className="text-2xl font-black text-slate-950">تسجيل دخول للنظام</h1>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-black text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
              جاري تحميل الموظفين...
            </div>
          ) : staffRows.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-7 text-amber-900">
              لا يوجد موظفين نشطين. افتح الإعدادات واضف موظف وكود دخول، أو استخدم النظام بدون تسجيل دخول مؤقتًا.
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-black text-slate-500">الموظف</span>
                <select
                  value={selectedId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setPinCode("");
                    setError(null);
                  }}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-emerald-400"
                >
                  {staffRows.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} - {roleLabels[normalizeStaffRole(staff.role)]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                  الدور هيحدد الصفحات والاختصارات المتاحة للموظف.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs font-black text-slate-500">
                  <KeyRound className="h-3.5 w-3.5" />
                  كود الدخول
                </span>
                <input
                  value={pinCode}
                  onChange={(event) => setPinCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void login();
                  }}
                  placeholder="اكتب كود الدخول"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-center text-lg font-black tracking-[0.25em] outline-none focus:border-emerald-400"
                  dir="ltr"
                />
              </label>

              <button
                type="button"
                onClick={login}
                disabled={saving}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                <LogIn className="h-5 w-5" />
                {saving ? "جاري الدخول..." : "دخول"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
