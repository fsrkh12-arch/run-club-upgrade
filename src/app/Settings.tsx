import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { User, Shield, Bell, Palette, Ruler, Globe, Save, X, Check } from "lucide-react";
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

  useEffect(() => { setName(profile?.display_name || ""); setHandle(profile?.handle || ""); setCity(profile?.city || ""); }, [profile]);
  useEffect(() => { (async () => {
    const { data } = await supabase.from("profiles").select("bio").eq("user_id", session.user.id).maybeSingle();
    if (data?.bio) setBio(data.bio);
  })(); }, [session]);

  const toggleDay = (d: string) => update({ preferred_run_days: settings.preferred_run_days.includes(d) ? settings.preferred_run_days.filter(x=>x!==d) : [...settings.preferred_run_days, d] });

  const saveProfile = async () => {
    const { error } = await supabase.from("profiles").update({ display_name: name, handle, city, bio, weekly_km_goal: settings.weekly_km_goal, avatar_initials: name.slice(0,2).toUpperCase() }).eq("user_id", session.user.id);
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
        <Field label={t("bio")} full><Textarea value={bio} onChange={(e)=>setBio(e.target.value)} /></Field>
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

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-destructive">{t("quit")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("quit_desc")}</p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4"><X className="h-4 w-4" /> {t("quit")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("quit_confirm_title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("quit_confirm_body")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel className="bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"><Check className="h-4 w-4" /> {t("quit_no")}</AlertDialogCancel>
              <AlertDialogAction onClick={quit} className="bg-destructive text-destructive-foreground hover:bg-destructive/90"><X className="h-4 w-4" /> {t("quit_yes")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
