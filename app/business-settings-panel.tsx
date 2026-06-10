"use client";

import { useEffect, useState } from "react";
import { Building2, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BusinessSettings, TaxMode, defaultBusinessSettings, normalizeBusinessSettings } from "@/app/business-settings";

function getSupabaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object") {
    const source = error as { message?: string; details?: string; hint?: string; code?: string };
    const message = [source.message, source.details, source.hint].filter(Boolean).join(" ");

    if (source.code === "42P01") {
      return "إعدادات النشاط غير مفعلة على قاعدة البيانات. تواصل مع مسؤول النظام لتجهيزها.";
    }

    if (source.code === "PGRST204") {
      return "إعدادات النشاط تحتاج تحديث من مسؤول النظام، ثم أعد تحميل الصفحة.";
    }

    if (source.code === "42501") {
      return "صلاحيات قاعدة البيانات لا تسمح بحفظ إعدادات النشاط. راجع RLS/Policies على جدول business_settings.";
    }

    if (message) return message;
  }

  return "فشل حفظ إعدادات النشاط.";
}

export function BusinessSettingsPanel() {
  const [settings, setSettings] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: loadError } = await supabase
          .from("business_settings")
          .select("*")
          .eq("id", "main")
          .maybeSingle();

        if (loadError) throw loadError;
        if (!cancelled && data) {
          setSettings(normalizeBusinessSettings(data));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل إعدادات النشاط. تواصل مع مسؤول النظام.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: saveError } = await supabase
        .from("business_settings")
        .upsert(
          {
            id: "main",
            ...settings,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();

      if (saveError) throw saveError;
      setMessage("تم حفظ إعدادات النشاط.");
    } catch (saveError) {
      setError(getSupabaseErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-950">إعدادات النشاط</h2>
          <p className="text-xs font-bold text-slate-500">تخصيص النظام حسب نوع المحل وطريقة التشغيل.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm font-black text-slate-400">جاري تحميل الإعدادات...</div>
      ) : (
        <div className="space-y-4">
          {(message || error) && (
            <div
              className={`rounded-2xl p-3 text-xs font-black ${
                error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {error || message}
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">اسم النشاط</span>
            <input
              value={settings.business_name}
              onChange={(event) => setSettings({ ...settings, business_name: event.target.value })}
              placeholder="اسم النشاط"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
            />
            <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
              الاسم ده هيستخدم لاحقًا في الفواتير والتقارير والطباعة.
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">نوع النشاط</span>
              <select
                value={settings.activity_type}
                onChange={(event) => setSettings({ ...settings, activity_type: event.target.value })}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
              >
                <option value="general">محل عام</option>
                <option value="pharmacy">صيدلية</option>
                <option value="clothes">ملابس</option>
                <option value="food">غذائي</option>
                <option value="electronics">إلكترونيات</option>
                <option value="services">خدمات</option>
              </select>
              <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                اختياره يساعد النظام يقترح الأقسام والحقول المناسبة لكل صنف.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">نظام الضريبة</span>
              <select
                value={settings.tax_mode}
                onChange={(event) => setSettings({ ...settings, tax_mode: event.target.value as TaxMode })}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
              >
                <option value="none">بدون ضريبة</option>
                <option value="included">الأسعار شاملة الضريبة</option>
                <option value="excluded">الضريبة تضاف على الفاتورة</option>
              </select>
              <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                لو نشاطك غير ضريبي سيبها بدون ضريبة لتجنب اختلاف إجمالي الفاتورة.
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">طريقة الدفع الافتراضية</span>
              <select
                value={settings.default_payment_method}
                onChange={(event) => setSettings({ ...settings, default_payment_method: event.target.value })}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-indigo-400"
              >
                <option value="cash">نقدي</option>
                <option value="card">فيزا</option>
                <option value="wallet">محفظة</option>
                <option value="bank">تحويل بنكي</option>
              </select>
              <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                الطريقة دي هتكون الاختيار الأول عند تسجيل حركة خزنة أو دفع.
              </span>
            </label>
          </div>

          <label className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-700">
            <span>
              السماح بالبيع بالسالب
              <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                لو مقفولة، المفروض النظام يمنع بيع كمية أكبر من المخزون المتاح.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.allow_negative_stock}
              onChange={(event) => setSettings({ ...settings, allow_negative_stock: event.target.checked })}
              className="h-5 w-5"
            />
          </label>

          <label className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-700">
            <span>
              إلزام قفل الوردية
              <span className="mt-1 block text-[11px] font-bold leading-5 text-slate-400">
                مفيدة للمحاسبة اليومية: افتح وردية في بداية اليوم واقفلها بعد مراجعة الخزنة.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.require_shift_close}
              onChange={(event) => setSettings({ ...settings, require_shift_close: event.target.checked })}
              className="h-5 w-5"
            />
          </label>

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "جاري الحفظ..." : "حفظ إعدادات النشاط"}
          </button>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
            <h3 className="text-sm font-black text-indigo-900">إرشادات إعدادات النشاط</h3>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs font-bold leading-6 text-indigo-900/80">
              <li>اكتب اسم النشاط زي ما تحب يظهر في التقارير والفواتير.</li>
              <li>اختار نوع النشاط الأقرب لطبيعة المحل عشان الحقول والأقسام تبقى مناسبة.</li>
              <li>اختار نظام الضريبة الصحيح قبل تشغيل الفواتير لأنه يؤثر على الإجمالي النهائي.</li>
              <li>لو العميل بيقفل يومية، فعل إلزام قفل الوردية واستخدم مركز العمليات يوميًا.</li>
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
