"use client";

import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { normalizeStaffRole, permissionLabels, roleLabels, rolePermissions, staffTemplatesForActivity } from "@/lib/permissions";
import { useBusinessSettings } from "@/app/business-settings";

type StaffMember = {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  is_active: boolean;
};

function roleDescription(role: string) {
  if (role === "owner") return "صلاحية كاملة لإدارة النظام والإعدادات والتقارير.";
  if (role === "manager") return "متابعة اليوميات والمبيعات والمخزون بدون تغيير الإعدادات الحساسة.";
  if (role === "cashier") return "استخدام البيع والتحصيل والمرتجعات اليومية.";
  if (role === "inventory") return "إضافة أصناف وتسويات ومتابعة حركة المخزون.";
  if (role === "accountant") return "تقارير مالية وخزنة ومراجعة أرصدة العملاء والموردين.";
  return "دور مخصص يتم تحديد صلاحياته لاحقًا.";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "تعذر حفظ بيانات الموظفين.";
}

export function StaffSettingsPanel() {
  const { settings: businessSettings } = useBusinessSettings();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", role: "cashier", pinCode: "" });
  const roleTemplates = staffTemplatesForActivity(businessSettings.activity_type);
  const selectedRole = normalizeStaffRole(form.role);

  async function loadMembers() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: loadError } = await supabase
        .from("staff_members")
        .select("id,name,role,phone,is_active")
        .order("created_at", { ascending: false });

      if (loadError) throw loadError;
      setMembers((data || []) as StaffMember[]);
    } catch (loadError) {
      setError(`${errorMessage(loadError)} تواصل مع مسؤول النظام لتفعيل إدارة الموظفين.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addMember() {
    if (!form.name.trim()) {
      setError("اكتب اسم الموظف الأول.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: addError } = await supabase.from("staff_members").insert([
        {
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          pin_code: form.pinCode.trim() || null,
          is_active: true,
        },
      ]);
      if (addError) throw addError;

      setForm({ name: "", phone: "", role: "cashier", pinCode: "" });
      setMessage("تم إضافة الموظف.");
      await loadMembers();
    } catch (addError) {
      setError(errorMessage(addError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(member: StaffMember) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: updateError } = await supabase
        .from("staff_members")
        .update({ is_active: !member.is_active })
        .eq("id", member.id);
      if (updateError) throw updateError;

      setMessage(member.is_active ? "تم إيقاف الموظف." : "تم تفعيل الموظف.");
      await loadMembers();
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">الموظفين والأدوار</h2>
          <p className="text-xs font-bold text-slate-500">أساس الصلاحيات قبل تفعيل تسجيل الدخول الكامل.</p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`mb-4 rounded-2xl p-3 text-xs font-black ${
            error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3">
            <h3 className="text-sm font-black text-slate-950">قوالب صلاحيات حسب النشاط</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              اختار قالب مناسب لطبيعة الموظف، والسيستم هيحدد الدور والصلاحيات الأساسية.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {roleTemplates.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => setForm({ ...form, role: template.role })}
                className={`rounded-2xl border p-3 text-right transition ${
                  selectedRole === template.role
                    ? "border-emerald-200 bg-white text-emerald-700 shadow-sm"
                    : "border-transparent bg-white/70 text-slate-600 hover:bg-white"
                }`}
              >
                <span className="block text-sm font-black">{template.title}</span>
                <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-500">{template.description}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {rolePermissions[selectedRole].map((permission) => (
              <span key={permission} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-600">
                {permissionLabels[permission]}
              </span>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-black text-slate-500">اسم الموظف</span>
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="مثال: أحمد الكاشير"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-slate-500"
          />
          <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
            الاسم ده هيظهر لاحقًا في الوردية وحركة المخزون والفواتير.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">الدور</span>
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-slate-500"
            >
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
              {roleDescription(form.role)}
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">رقم الهاتف</span>
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="اختياري"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-slate-500"
            />
            <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
              مفيد للمتابعة الداخلية، ومش مطلوب لتشغيل النظام.
            </span>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-xs font-black text-slate-500">
            <KeyRound className="h-3.5 w-3.5" />
            كود الدخول
          </span>
          <input
            value={form.pinCode}
            onChange={(event) => setForm({ ...form, pinCode: event.target.value })}
            placeholder="مثال: 1234"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-slate-500"
          />
          <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
            الموظف هيستخدم الكود ده في صفحة تسجيل الدخول. خليه قصير وسهل للموظف فقط.
          </span>
        </label>

        <button
          type="button"
          onClick={addMember}
          disabled={saving}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          <UserPlus className="h-5 w-5" />
          إضافة موظف
        </button>
      </div>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-black text-slate-400">
            جاري تحميل الموظفين...
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 p-4 text-center text-xs font-black text-slate-400">
            لا يوجد موظفين مسجلين بعد.
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-950">{member.name}</p>
                <p className="text-xs font-bold text-slate-400">
                  {roleLabels[normalizeStaffRole(member.role)]}
                  {member.phone ? ` - ${member.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(member)}
                disabled={saving}
                className={`rounded-2xl px-3 py-2 text-xs font-black ${
                  member.is_active
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {member.is_active ? "نشط" : "موقوف"}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-black text-slate-950">إرشادات الموظفين</h3>
        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
          سجل الموظفين هنا بيتحكم في الدخول المحلي والصلاحيات. لو مفيش موظف مسجل دخول، النظام يفضل مفتوح لتجنب قفل النظام بالخطأ.
        </p>
      </div>
    </section>
  );
}
