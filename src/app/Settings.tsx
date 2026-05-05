import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { User, Shield, Bell, Palette, Ruler, Calendar, Globe, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Settings = {
  units: string; theme: string; accent: string;
  default_run_visibility: string; profile_visibility: string; show_on_leaderboard: boolean;
  notify_messages: boolean; notify_challenges: boolean; notify_weekly_summary: boolean;
  weekly_km_goal: number; preferred_run_days: string[]; language: string;
};
const DEFAULTS: Settings = { units: "metric", theme: "system", accent: "mint", default_run_visibility: "private", profile_visibility: "public", show_on_leaderboard: true, notify_messages: true, notify_challenges: true, notify_weekly_summary: true, weekly_km_goal: 30, preferred_run_days: ["mon","wed","fri","sun"], language: "en" };

const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

export default function SettingsPage() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [name, setName] = useState(profile?.display_name || "");
  const [handle, setHandle] = useState(profile?.handle || "");
  const [city, setCity] = useState(profile?.city || "");
  const [bio, setBio] = useState("");

  useEffect(() => { setName(profile?.display_name || ""); setHandle(profile?.handle || ""); setCity(profile?.city || ""); }, [profile]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", session.user.id).maybeSingle();
      if (data) setSettings({ ...DEFAULTS, ...data } as Settings);
      else await supabase.from("user_settings").insert({ user_id: session.user.id });
      const { data: prof } = await supabase.from("profiles").select("bio").eq("user_id", session.user.id).maybeSingle();
      if (prof?.bio) setBio(prof.bio);
    })();
  }, [session]);

  const update = (k: keyof Settings, v: any) => setSettings(s => ({ ...s, [k]: v }));
  const toggleDay = (d: string) => update("preferred_run_days", settings.preferred_run_days.includes(d) ? settings.preferred_run_days.filter(x=>x!==d) : [...settings.preferred_run_days, d]);

  const save = async () => {
    const [s, p] = await Promise.all([
      supabase.from("user_settings").upsert({ user_id: session.user.id, ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
      supabase.from("profiles").update({ display_name: name, handle, city, bio, weekly_km_goal: settings.weekly_km_goal, avatar_initials: name.slice(0,2).toUpperCase() }).eq("user_id", session.user.id),
    ]);
    if (s.error || p.error) return toast.error(s.error?.message || p.error?.message || "Failed");
    toast.success("Settings saved"); refreshProfile();
  };

  const deleteAccount = async () => {
    if (!confirm("Delete your account? This is irreversible.")) return;
    await supabase.from("runs").delete().eq("user_id", session.user.id);
    await supabase.from("goals").delete().eq("user_id", session.user.id);
    await supabase.auth.signOut();
    toast.success("Signed out. Contact support for full deletion.");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-2xl border border-border bg-card p-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">Settings</h1><p className="mt-1 text-sm text-muted-foreground">Tailor every detail to how you train.</p></div>
        <Button onClick={save} className="rounded-xl"><Save className="h-4 w-4" /> Save changes</Button>
      </motion.div>

      <Section icon={User} title="Profile">
        <Field label="Display name"><Input value={name} onChange={(e)=>setName(e.target.value)} /></Field>
        <Field label="Handle"><Input value={handle} onChange={(e)=>setHandle(e.target.value)} placeholder="yourname" /></Field>
        <Field label="City"><Input value={city} onChange={(e)=>setCity(e.target.value)} /></Field>
        <Field label="Bio" full><Textarea value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="Tell the club about you" /></Field>
      </Section>

      <Section icon={Shield} title="Privacy">
        <Field label="Profile visibility">
          <Select value={settings.profile_visibility} onValueChange={(v)=>update("profile_visibility", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="communities">Communities only</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Default run visibility">
          <Select value={settings.default_run_visibility} onValueChange={(v)=>update("default_run_visibility", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="public">Public</SelectItem><SelectItem value="communities">Communities only</SelectItem><SelectItem value="private">Private</SelectItem></SelectContent>
          </Select>
        </Field>
        <Toggle label="Show on leaderboards" checked={settings.show_on_leaderboard} onChange={(v)=>update("show_on_leaderboard", v)} />
      </Section>

      <Section icon={Bell} title="Notifications">
        <Toggle label="New messages in your communities" checked={settings.notify_messages} onChange={(v)=>update("notify_messages", v)} />
        <Toggle label="Challenge updates" checked={settings.notify_challenges} onChange={(v)=>update("notify_challenges", v)} />
        <Toggle label="Weekly training summary" checked={settings.notify_weekly_summary} onChange={(v)=>update("notify_weekly_summary", v)} />
      </Section>

      <Section icon={Ruler} title="Units & training">
        <Field label="Units">
          <Select value={settings.units} onValueChange={(v)=>update("units", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="metric">Metric (km)</SelectItem><SelectItem value="imperial">Imperial (mi)</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Weekly distance goal"><Input type="number" value={settings.weekly_km_goal} onChange={(e)=>update("weekly_km_goal", Number(e.target.value))} /></Field>
        <Field label="Preferred run days" full>
          <div className="flex flex-wrap gap-2">{DAYS.map(d => (
            <button key={d} onClick={()=>toggleDay(d)} className={cn("rounded-lg border border-border px-3 py-1.5 text-xs uppercase tracking-wider transition", settings.preferred_run_days.includes(d) ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{d}</button>
          ))}</div>
        </Field>
      </Section>

      <Section icon={Palette} title="Appearance">
        <Field label="Theme">
          <Select value={settings.theme} onValueChange={(v)=>update("theme", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Accent color">
          <div className="flex gap-2">{[["mint","#10b981"],["amber","#f59e0b"],["rose","#f43f5e"],["sky","#0ea5e9"],["violet","#8b5cf6"]].map(([k,c])=>(
            <button key={k} onClick={()=>update("accent", k)} className={cn("h-9 w-9 rounded-lg border-2 transition", settings.accent===k?"border-foreground scale-110":"border-transparent")} style={{ background: c }} />
          ))}</div>
        </Field>
      </Section>

      <Section icon={Globe} title="Language">
        <Field label="App language">
          <Select value={settings.language} onValueChange={(v)=>update("language", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="az">Azərbaycan</SelectItem><SelectItem value="ru">Русский</SelectItem><SelectItem value="tr">Türkçe</SelectItem></SelectContent>
          </Select>
        </Field>
      </Section>

      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-destructive"><Trash2 className="h-4 w-4" /> Danger zone</h3>
        <p className="mt-1 text-sm text-muted-foreground">Permanently delete your runs, goals and account.</p>
        <Button variant="destructive" className="mt-4" onClick={deleteAccount}>Delete account</Button>
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
