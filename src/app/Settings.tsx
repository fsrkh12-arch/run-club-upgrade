import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { User, Shield, Bell, Palette, Ruler, Globe, Save, X, Check, AlertTriangle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSettings, type Accent } from "@/lib/settings-context";

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
const ACCENTS: { k: Accent; c: string; label: string }[] = [
  { k: "mint", c: "#10b981", label: "Mint" },
  { k: "amber", c: "#f59e0b", label: "Amber" },
  { k: "rose", c: "#f43f5e", label: "Rose" },
  { k: "sky", c: "#0ea5e9", label: "Sky" },
  { k: "violet", c: "#8b5cf6", label: "Violet" },
  { k: "black", c: "#0a0a0a", label: "Black" },
];

export default function SettingsPage() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const { settings, update, t } = useSettings();
  const nav = useNavigate();
  const [name, setName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.handle || "");
  const [city, setCity] = useState(profile?.city || "");
  const [bio, setBio] = useState("");
  const [weight, setWeight] = useState<string>("");
  const [height, setHeight] = useState<string>("");
  const [dob, setDob] = useState<string>("");

  useEffect(() => { setName(profile?.display_name || ""); setHandle(profile?.handle || ""); setCity(profile?.city || ""); }, [profile]);
  useEffect(() => { (async () => {
    const { data } = await supabase.from("profiles").select("bio, weight_kg, height_cm, dob").eq("user_id", session.user.id).maybeSingle();
    if (data) {
      if (data.bio) setBio(data.bio);
      if (data.weight_kg != null) setWeight(String(data.weight_kg));
      if (data.height_cm != null) setHeight(String(data.height_cm));
      if (data.dob) setDob(data.dob);
    }
  })(); }, [session]);

  const toggleDay = (d: string) => update({ preferred_run_days: settings.preferred_run_days.includes(d) ? settings.preferred_run_days.filter(x=>x!==d) : [...settings.preferred_run_days, d] });

  const saveProfile = async () => {
    const { error } = await supabase.from("profiles").update({
      display_name: name, handle, city, bio,
      weekly_km_goal: settings.weekly_km_goal,
      avatar_initials: name.slice(0,2).toUpperCase(),
      weight_kg: weight ? Number(weight) : null,
      height_cm: height ? Number(height) : null,
      dob: dob || null,
    }).eq("user_id", session.user.id);
    if (error) return toast.error(error.message);
    toast.success(t("saved")); refreshProfile();
  };

  const quit = async () => {
    await supabase.from("runs").delete().eq("user_id", session.user.id);
    await supabase.from("goals").delete().eq("user_id", session.user.id);
    await supabase.from("trails").delete().eq("user_id", session.user.id);
    await supabase.from("community_members").delete().eq("user_id", session.user.id);
    await supabase.from("notifications").delete().eq("user_id", session.user.id);
    await supabase.from("profiles").delete().eq("user_id", session.user.id);
    await supabase.auth.signOut();
    toast.success("You've left the club. We'll miss you.");
    nav("/");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-2xl border border-border bg-card p-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">{t("settings")}</h1><p className="mt-1 text-sm text-muted-foreground">Every change saves instantly.</p></div>
        <Button onClick={saveProfile} className="rounded-xl"><Save className="h-4 w-4" /> {t("save")}</Button>
      </motion.div>

      <Section icon={User} title={t("profile")}>
        <Field label={t("display_name")}><Input value={name} onChange={(e)=>setName(e.target.value)} /></Field>
        <Field label={t("handle")}><Input value={handle} onChange={(e)=>setHandle(e.target.value)} /></Field>
        <Field label={t("city")}><Input value={city} onChange={(e)=>setCity(e.target.value)} /></Field>
        <Field label="Date of birth"><Input type="date" value={dob} onChange={(e)=>setDob(e.target.value)} /></Field>
        <Field label="Weight (kg)"><Input type="number" min="20" max="250" step="0.1" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder="70" /></Field>
        <Field label="Height (cm)"><Input type="number" min="80" max="250" value={height} onChange={(e)=>setHeight(e.target.value)} placeholder="175" /></Field>
        <Field label="Bio" full><Textarea value={bio} onChange={(e)=>setBio(e.target.value)} /></Field>
        <div className="sm:col-span-2 -mt-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">🔒 Your weight, height and date of birth are <span className="font-semibold text-foreground">private</span> — used only to refine calorie burn and pace zones. Never shared with third parties.</div>
      </Section>

      <Section icon={Shield} title={t("privacy")}>
        <Field label={t("profile_visibility")}>
          <Select value={settings.profile_visibility} onValueChange={(v)=>update({ profile_visibility: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="public">{t("public")}</SelectItem><SelectItem value="communities">{t("communities_only")}</SelectItem><SelectItem value="private">{t("private")}</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label={t("run_visibility")}>
          <Select value={settings.default_run_visibility} onValueChange={(v)=>update({ default_run_visibility: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="public">{t("public")}</SelectItem><SelectItem value="communities">{t("communities_only")}</SelectItem><SelectItem value="private">{t("private")}</SelectItem></SelectContent>
          </Select>
        </Field>
        <Toggle label={t("show_lb")} checked={settings.show_on_leaderboard} onChange={(v)=>update({ show_on_leaderboard: v })} />
      </Section>

      <Section icon={Bell} title={t("notifications")}>
        <Toggle label={t("notify_messages")} checked={settings.notify_messages} onChange={(v)=>update({ notify_messages: v })} />
        <Toggle label={t("notify_challenges")} checked={settings.notify_challenges} onChange={(v)=>update({ notify_challenges: v })} />
        <Toggle label={t("notify_weekly")} checked={settings.notify_weekly_summary} onChange={(v)=>update({ notify_weekly_summary: v })} />
      </Section>

      <Section icon={Ruler} title={t("units")}>
        <Field label="Units">
          <Select value={settings.units} onValueChange={(v)=>update({ units: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="metric">{t("metric")}</SelectItem><SelectItem value="imperial">{t("imperial")}</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label={t("weekly_goal")}><Input type="number" value={settings.weekly_km_goal} onChange={(e)=>update({ weekly_km_goal: Number(e.target.value) })} /></Field>
        <Field label={t("run_days")} full>
          <div className="flex flex-wrap gap-2">{DAYS.map(d => (
            <button key={d} onClick={()=>toggleDay(d)} className={cn("rounded-lg border border-border px-3 py-1.5 text-xs uppercase tracking-wider transition", settings.preferred_run_days.includes(d) ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{d}</button>
          ))}</div>
        </Field>
      </Section>

      <Section icon={Palette} title={t("appearance")}>
        <Field label={t("theme")}>
          <Select value={settings.theme} onValueChange={(v)=>update({ theme: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="system">{t("system")}</SelectItem><SelectItem value="light">{t("light")}</SelectItem><SelectItem value="dark">{t("dark")}</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label={t("accent")} full>
          <div className="flex flex-wrap gap-3">{ACCENTS.map(({k,c,label})=>(
            <button key={k} onClick={()=>update({ accent: k })} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition", settings.accent===k?"border-foreground":"border-transparent hover:border-border")}>
              <span className="h-9 w-9 rounded-lg" style={{ background: c }} />
              <span className="font-mono-tech text-[10px] uppercase">{label}</span>
            </button>
          ))}</div>
        </Field>
      </Section>

      <Section icon={Globe} title={t("language")}>
        <Field label={t("language")}>
          <Select value={settings.language} onValueChange={(v)=>update({ language: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="az">Azərbaycan</SelectItem><SelectItem value="ru">Русский</SelectItem><SelectItem value="tr">Türkçe</SelectItem></SelectContent>
          </Select>
        </Field>
      </Section>

      <div className="relative overflow-hidden rounded-2xl border border-destructive/40 bg-gradient-to-br from-destructive/10 via-background to-background p-6">
        <div className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-destructive/20 blur-3xl" />
        <div className="relative">
          <h3 className="flex items-center gap-2 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> {t("quit")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("quit_desc")}</p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4"><X className="h-4 w-4" /> {t("quit")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="overflow-hidden border-0 bg-transparent p-0 shadow-2xl w-[95vw] max-w-2xl sm:max-w-2xl">
              <div className="relative rounded-2xl border border-border/60 bg-background/95 p-7 backdrop-blur-xl">
                {/* glow rings */}
                <div className="pointer-events-none absolute inset-0 rounded-2xl">
                  <div className="absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-destructive/30 blur-3xl" />
                  <div className="absolute bottom-0 right-0 h-32 w-32 rounded-full bg-emerald-500/20 blur-3xl" />
                </div>
                <div className="relative">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-mono-tech text-[10px] uppercase tracking-[0.2em] text-destructive">// terminal warning</div>
                      <AlertDialogTitle className="text-xl font-semibold tracking-tight">{t("quit_confirm_title")}</AlertDialogTitle>
                    </div>
                  </div>
                  <AlertDialogDescription className="text-sm leading-relaxed text-muted-foreground">
                    {t("quit_confirm_body")}
                  </AlertDialogDescription>
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">
                    <div className="text-center"><div className="text-base font-semibold text-foreground">{profile?.xp ?? 0}</div>XP</div>
                    <div className="text-center"><div className="text-base font-semibold text-foreground">{profile?.streak_days ?? 0}d</div>streak</div>
                    <div className="text-center"><div className="text-base font-semibold text-foreground">∞</div>memories</div>
                  </div>
                  <AlertDialogFooter className="mt-6 flex-col-reverse gap-2 sm:flex-row sm:gap-2">
                    <AlertDialogAction onClick={quit} className="group relative overflow-hidden rounded-xl border border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground sm:flex-1">
                      <X className="h-4 w-4" /> {t("quit_yes")}
                    </AlertDialogAction>
                    <AlertDialogCancel className="group relative m-0 overflow-hidden rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-400 hover:to-emerald-500 hover:text-white sm:flex-1">
                      <Zap className="h-4 w-4" /> {t("quit_no")}
                    </AlertDialogCancel>
                  </AlertDialogFooter>
                </div>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: any) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-2xl border border-border bg-card p-6">
      <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold"><Icon className="h-4 w-4" /> {title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </motion.section>
  );
}
function Field({ label, children, full }: any) { return <div className={full?"sm:col-span-2 space-y-2":"space-y-2"}><Label>{label}</Label>{children}</div>; }
function Toggle({ label, checked, onChange }: any) { return <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-border p-3"><Label className="cursor-pointer">{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>; }
