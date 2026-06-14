"use client";

import { useEffect, useState } from "react";
import { KeyRound, RotateCcw, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  allPermissions,
  normalizeStaffRole,
  permissionLabels,
  roleLabels,
  roleOrder,
  rolePermissions,
  sanitizeRolePermissions,
  staffTemplatesForActivity,
  type Permission,
  type RolePermissionMap,
  type StaffRole,
  writeRolePermissions,
} from "@/lib/permissions";
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
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", role: "cashier", pinCode: "" });
  const [permissionConfig, setPermissionConfig] = useState(rolePermissions);
  const roleTemplates = staffTemplatesForActivity(businessSettings.activity_type);
  const selectedRole = normalizeStaffRole(form.role);
  const selectedPermissions = permissionConfig[selectedRole] || rolePermissions[selectedRole];

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
    async function loadPermissionSettings() {
      try {
        const { data, error: loadPermissionsError } = await supabase
          .from("business_settings")
          .select("role_permissions")
          .eq("id", "main")
          .maybeSingle();
        if (loadPermissionsError) throw loadPermissionsError;

        const remotePermissions = (data as { role_permissions?: unknown } | null)?.role_permissions;
        if (remotePermissions) {
          const sanitized = sanitizeRolePermissions(remotePermissions);
          setPermissionConfig(sanitized);
          writeRolePermissions(sanitized);
        } else {
          setPermissionConfig(rolePermissions);
        }
      } catch (loadPermissionsError) {
        setPermissionConfig(rolePermissions);
        setError(`${errorMessage(loadPermissionsError)} تأكد من تشغيل supabase-professional-upgrade.sql عشان صلاحيات الأدوار تتحفظ في الداتا بيز.`);
      }
    }

    void loadPermissionSettings();

    const timer = window.setTimeout(() => {
      void loadMembers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function persistPermissions(nextConfig: RolePermissionMap) {
    const sanitized = sanitizeRolePermissions(nextConfig);
    const previousConfig = permissionConfig;

    setSavingPermissions(true);
    setError(null);
    setMessage(null);

    try {
      const { error: savePermissionsError } = await supabase
        .from("business_settings")
        .upsert(
          {
            id: "main",
            role_permissions: sanitized,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();
      if (savePermissionsError) throw savePermissionsError;

      setPermissionConfig(sanitized);
      writeRolePermissions(sanitized);
      setMessage("تم حفظ الصلاحيات في قاعدة البيانات.");
    } catch (savePermissionsError) {
      setPermissionConfig(previousConfig);
      setError(`${errorMessage(savePermissionsError)} لم يتم حفظ الصلاحيات. شغل supabase-professional-upgrade.sql وتأكد من صلاحيات جدول business_settings.`);
    } finally {
      setSavingPermissions(false);
    }
  }

  function togglePermission(role: StaffRole, permission: Permission) {
    if (role === "owner") {
      setMessage("صلاحيات المالك ثابتة لحماية النظام من قفل الإعدادات بالخطأ.");
      setError(null);
      return;
    }

    if (permission === "dashboard:view") {
      setMessage("لوحة التحكم تظل مفتوحة لكل دور عشان الموظف يقدر يرجع للنظام بسهولة.");
      setError(null);
      return;
    }

    const currentPermissions = permissionConfig[role] || rolePermissions[role];
    const nextRolePermissions = currentPermissions.includes(permission)
      ? currentPermissions.filter((item) => item !== permission)
      : [...currentPermissions, permission];
    const nextConfig = { ...permissionConfig, [role]: nextRolePermissions };

    void persistPermissions(nextConfig);
  }

  function restoreDefaultPermissions() {
    void persistPermissions(rolePermissions);
  }

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

  async function updateMemberRole(member: StaffMember, role: StaffRole) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: updateError } = await supabase
        .from("staff_members")
        .update({ role })
        .eq("id", member.id);
      if (updateError) throw updateError;

      setMessage("تم تحديث دور الموظف.");
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
            {selectedPermissions.map((permission) => (
              <span key={permission} className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-slate-600">
                {permissionLabels[permission]}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-950">
                <UserCog className="h-4 w-4 text-emerald-600" />
                مصفوفة الوصول والصلاحيات
              </h3>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                عدل صلاحيات كل دور، والتغيير يسمع فورًا في القائمة الجانبية وفتح الصفحات.
              </p>
            </div>
            <button
              type="button"
              onClick={restoreDefaultPermissions}
              disabled={savingPermissions}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              {savingPermissions ? "جاري الحفظ..." : "الافتراضي"}
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {roleOrder.map((role) => (
              <div key={role} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">{roleLabels[role]}</p>
                    <p className="text-[11px] font-bold text-slate-400">
                      {role === "owner" ? "صلاحيات كاملة وثابتة" : `${(permissionConfig[role] || []).length} صلاحيات مفعلة`}
                    </p>
                  </div>
                  {role === "owner" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">
                      محمي
                    </span>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {allPermissions.map((permission) => {
                    const checked = (permissionConfig[role] || []).includes(permission);
                    const locked = role === "owner" || permission === "dashboard:view";

                    return (
                      <label
                        key={permission}
                        className={`flex min-h-11 items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition ${
                          checked
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : "border-transparent bg-white/60 text-slate-500"
                        } ${locked ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:border-slate-200"}`}
                      >
                        <span>{permissionLabels[permission]}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked || savingPermissions}
                          onChange={() => togglePermission(role, permission)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
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
            <div key={member.id} className="grid gap-3 rounded-2xl border border-slate-100 p-3 md:grid-cols-[1fr_180px_auto] md:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-950">{member.name}</p>
                <p className="text-xs font-bold text-slate-400">
                  {roleLabels[normalizeStaffRole(member.role)]}
                  {member.phone ? ` - ${member.phone}` : ""}
                </p>
              </div>
              <select
                value={normalizeStaffRole(member.role)}
                onChange={(event) => updateMemberRole(member, normalizeStaffRole(event.target.value))}
                disabled={saving}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-700 outline-none focus:border-emerald-400"
              >
                {roleOrder.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toggleActive(member)}
                disabled={saving}
                className={`h-10 rounded-2xl px-3 py-2 text-xs font-black ${
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
          سجل الموظفين هنا بيتحكم في الدخول والصلاحيات. تعديلات الصلاحيات لا تعتبر محفوظة إلا بعد نجاح حفظها في قاعدة البيانات، ولو ظهرت رسالة خطأ شغل ملف ترقية Supabase قبل إعادة المحاولة.
        </p>
      </div>
    </section>
  );
}
