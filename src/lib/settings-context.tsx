import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "./i18n";
import { t as tr } from "./i18n";

export type Accent = "mint" | "amber" | "rose" | "sky" | "violet" | "black";
const ACCENT_HSL: Record<Accent, string> = {
  mint: "166 77% 44%",
  amber: "38 92% 52%",
  rose: "346 84% 58%",
  sky: "199 89% 48%",
  violet: "262 83% 58%",
  black: "0 0% 8%",
};

export type Settings = {
  units: "metric" | "imperial"; theme: "system" | "light" | "dark"; accent: Accent;
  default_run_visibility: "public" | "communities" | "private";
  profile_visibility: "public" | "communities" | "private";
  show_on_leaderboard: boolean;
  notify_messages: boolean; notify_challenges: boolean; notify_weekly_summary: boolean;
  weekly_km_goal: number; preferred_run_days: string[]; language: Lang;
};
const DEFAULTS: Settings = { units: "metric", theme: "system", accent: "mint", default_run_visibility: "private", profile_visibility: "public", show_on_leaderboard: true, notify_messages: true, notify_challenges: true, notify_weekly_summary: true, weekly_km_goal: 30, preferred_run_days: ["mon","wed","fri","sun"], language: "en" };

type Ctx = { settings: Settings; update: (patch: Partial<Settings>) => Promise<void>; t: (k: string) => string; loaded: boolean };
const SettingsCtx = createContext<Ctx>({ settings: DEFAULTS, update: async () => {}, t: (k) => k, loaded: false });

const applyTheme = (theme: Settings["theme"]) => {
  const root = document.documentElement;
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
};
const applyAccent = (accent: Accent) => {
  document.documentElement.style.setProperty("--accent", ACCENT_HSL[accent]);
  document.documentElement.style.setProperty("--data-b", ACCENT_HSL[accent]);
};

export function SettingsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();
      const merged = { ...DEFAULTS, ...(data || {}) } as Settings;
      setSettings(merged);
      applyTheme(merged.theme); applyAccent(merged.accent);
      setLoaded(true);
    })();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setSettings((s) => { applyTheme(s.theme); return s; });
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [userId]);

  const update = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.theme) applyTheme(next.theme);
    if (patch.accent) applyAccent(next.accent);
    await supabase.from("user_settings").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  };

  return <SettingsCtx.Provider value={{ settings, update, loaded, t: (k) => tr(settings.language, k) }}>{children}</SettingsCtx.Provider>;
}
export const useSettings = () => useContext(SettingsCtx);
