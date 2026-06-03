"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CheckCircle2,
  Link2,
  Loader2,
  Send,
  Settings,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type ReportSettings = {
  telegramChatId: string;
  dailyEnabled: boolean;
  linkCode: string;
  updatedAt: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع";
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "فشل الطلب");
  }
  return data;
}

export default function ReportSettingsPage() {
  const [telegramChatId, setTelegramChatId] = useState("");
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [linkCode, setLinkCode] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const botLink = useMemo(() => {
    if (!botUsername || !linkCode) return "";
    return `https://t.me/${botUsername}?start=${linkCode}`;
  }, [botUsername, linkCode]);

  function applySettings(settings: ReportSettings) {
    setTelegramChatId(settings.telegramChatId);
    setDailyEnabled(settings.dailyEnabled || !settings.telegramChatId);
    setLinkCode(settings.linkCode);
    setUpdatedAt(settings.updatedAt);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setLoading(true);
      setError(null);

      try {
        const data = (await readJson(await fetch("/api/report-settings"))) as {
          settings: ReportSettings;
          botUsername: string;
        };
        if (cancelled) return;
        applySettings(data.settings);
        setBotUsername(data.botUsername);
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(chatId = telegramChatId, enabled = dailyEnabled) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const data = (await readJson(
        await fetch("/api/report-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ telegramChatId: chatId, dailyEnabled: enabled }),
        }),
      )) as { settings: ReportSettings };

      applySettings(data.settings);
      setMessage(data.settings.dailyEnabled ? "تم الحفظ. التقارير اليومية اتفعلت." : "تم الحفظ. التقارير اليومية متوقفة.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function confirmTelegramLink(showSuccessMessage = true) {
    setLinking(true);
    setError(null);
    setMessage(null);

    try {
      const data = (await readJson(
        await fetch("/api/report-settings/link", {
          method: "POST",
        }),
      )) as { settings: ReportSettings };

      applySettings(data.settings);
      if (showSuccessMessage) {
        setMessage("تم ربط حساب تليجرام بنجاح. التقارير اليومية اتفعلت.");
      }

      return data.settings;
    } catch (linkError) {
      setError(getErrorMessage(linkError));
      return null;
    } finally {
      setLinking(false);
    }
  }

  async function sendTestReport() {
    setTesting(true);
    setError(null);
    setMessage(null);

    try {
      let chatId = telegramChatId.trim();

      if (!chatId) {
        const linkedSettings = await confirmTelegramLink(false);
        chatId = linkedSettings?.telegramChatId.trim() ?? "";
      }

      if (!chatId) {
        throw new Error("ابعت كود الربط للبوت الأول، وبعدها اضغط تأكيد الربط أو إرسال تجربة مرة أخرى.");
      }

      await saveSettings(chatId, true);
      const data = (await readJson(
        await fetch("/api/report-settings/test", {
          method: "POST",
        }),
      )) as { telegramMessageId: number | null };

      setMessage(`تم إرسال تقرير تجربة على تليجرام${data.telegramMessageId ? ` #${data.telegramMessageId}` : ""}.`);
    } catch (testError) {
      setError(getErrorMessage(testError));
    } finally {
      setTesting(false);
    }
  }

  const isLinked = telegramChatId.trim().length > 0;
  const canSave = isLinked && !saving && !testing && !linking;
  const canLink = linkCode.trim().length > 0 && !saving && !testing && !linking;

  return (
    <div className="min-h-[calc(100vh-8rem)] text-right" dir="rtl">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <BellRing className="h-7 w-7" />
              </div>
              <h1 className="text-2xl font-black text-slate-950">إعداد التقارير اليومية</h1>
              <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">
                افتح البوت وابعت كود الربط، وبعدها اضغط تأكيد الربط. الموقع هيحفظ حساب المكتبة ويرسل التقرير اليومي تلقائيا.
              </p>
            </div>

            <Link
              href="/reports"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-200"
            >
              رجوع للتقارير
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-black">جاري تحميل الإعدادات...</span>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs font-black text-emerald-700">كود الربط</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="rounded-2xl bg-white px-5 py-4 text-center text-3xl font-black tracking-[0.25em] text-slate-950 shadow-sm sm:min-w-56">
                    {linkCode || "------"}
                  </div>
                  <div className="flex-1 text-sm font-bold leading-7 text-emerald-900">
                    {botLink ? (
                      <a className="font-black underline" href={botLink} target="_blank" rel="noreferrer">
                        افتح البوت بالكود مباشرة
                      </a>
                    ) : (
                      <span>افتح البوت وابعت الأمر: </span>
                    )}
                    <span className="mx-1 inline-block rounded-xl bg-white px-3 py-1 font-black text-slate-950" dir="ltr">
                      /start {linkCode || "CODE"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => confirmTelegramLink()}
                  disabled={!canLink}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                >
                  {linking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
                  تأكيد الربط
                </button>
              </div>

              {isLinked && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>الحساب مربوط بالفعل. Chat ID: </span>
                  <span className="rounded-xl bg-white px-3 py-1 font-black" dir="ltr">{telegramChatId}</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setDailyEnabled((value) => !value)}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-right transition ${
                  dailyEnabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                <span>
                  <span className="block font-black">إرسال التقرير يوميا</span>
                  <span className="mt-1 block text-xs font-bold opacity-70">
                    {dailyEnabled ? "مفعل: سيتم الإرسال مع الكرون اليومي" : "متوقف: الكرون لن يرسل أي تقرير"}
                  </span>
                </span>
                {dailyEnabled ? <ToggleRight className="h-9 w-9" /> : <ToggleLeft className="h-9 w-9" />}
              </button>

              <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="mb-2 block text-sm font-black text-slate-700">إدخال يدوي اختياري للـ Chat ID</span>
                <input
                  value={telegramChatId}
                  onChange={(event) => setTelegramChatId(event.target.value)}
                  placeholder="اتركه فاضي واستخدم كود الربط"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-left text-lg font-black text-slate-950 outline-none transition focus:border-emerald-400"
                  dir="ltr"
                />
                <span className="mt-2 block text-xs font-bold text-slate-400">
                  مش محتاج تكتبه في الاستخدام الطبيعي. اضغط تأكيد الربط بعد إرسال الكود للبوت.
                </span>
              </label>

              {updatedAt && (
                <p className="text-xs font-bold text-slate-400">
                  آخر تحديث: {new Date(updatedAt).toLocaleString("ar-EG")}
                </p>
              )}

              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                  {error}
                </div>
              )}

              {message && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => saveSettings()}
                  disabled={!canSave}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Settings className="h-5 w-5" />}
                  حفظ يدوي اختياري
                </button>

                <button
                  type="button"
                  onClick={sendTestReport}
                  disabled={!canLink}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {testing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  إرسال تجربة
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold leading-7 text-amber-900">
         انت في امان
        </section>
      </div>
    </div>
  );
}
