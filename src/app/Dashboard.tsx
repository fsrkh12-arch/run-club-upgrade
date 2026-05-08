import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, Flame, HeartPulse, Plus, Route, Trophy, Target, Mountain, Clock, Gauge, FileDown, ChevronRight, Footprints, Zap, Sparkles, Play } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import RunDetailDialog from "./RunDetailDialog";
import { exportRunsPdf } from "@/lib/pdf-export";
import { useSettings } from "@/lib/settings-context";

type Run = { id: string; route_name: string; distance_km: number; duration_seconds: number; avg_pace_seconds: number; avg_heart_rate: number | null; effort: number; run_at: string; notes: string | null; elevation_m: number; calories: number | null; cadence: number | null; step_count: number | null };
type Goal = { id: string; title: string; target_value: number; current_value: number; unit: string; status: string };

const schema = z.object({ route: z.string().trim().min(2).max(80), distance: z.coerce.number().min(0.1).max(200), duration: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/), hr: z.string().optional(), effort: z.coerce.number().min(1).max(10), notes: z.string().max(500).optional() });

const parseDur = (v: string) => { const p = v.split(":").map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
const fmtPace = (s?: number | null) => !s || !isFinite(s) ? "—" : `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;
const fmtDur = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h ? `${h}h ${m}m` : `${m}m`; };

export default function Dashboard() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const nav = useNavigate();
  const { t, settings } = useSettings();
  const unit = settings.units === "imperial" ? "mi" : "km";
  const conv = (km: number) => settings.units === "imperial" ? km * 0.621371 : km;

  const [runs, setRuns] = useState<Run[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [form, setForm] = useState({ route: "", distance: "5.0", duration: "27:30", hr: "152", effort: "6", notes: "" });
  const [goalForm, setGoalForm] = useState({ title: "Weekly distance", target: "40" });
  const [detail, setDetail] = useState<Run | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    const [r, g] = await Promise.all([
      supabase.from("runs").select("*").eq("user_id", session.user.id).order("run_at", { ascending: false }).limit(200),
      supabase.from("goals").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }),
    ]);
    setRuns((r.data || []) as Run[]); setGoals((g.data || []) as Goal[]);
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const totalKm = runs.reduce((s, r) => s + Number(r.distance_km), 0);
    const totalSec = runs.reduce((s, r) => s + Number(r.duration_seconds), 0);
    const avgPace = totalKm ? totalSec/totalKm : 0;
    const hrs = runs.filter(r=>r.avg_heart_rate);
    const avgHr = hrs.length ? hrs.reduce((s,r)=>s+(r.avg_heart_rate||0),0)/hrs.length : 0;
    const load = runs.reduce((s,r)=>s+r.effort*Number(r.distance_km),0);
    const elev = runs.reduce((s,r)=>s+r.elevation_m,0);
    const steps = runs.reduce((s,r)=>s+(r.step_count ?? Math.round(Number(r.distance_km)*1350)),0);
    const weekKm = runs.filter(r => Date.now()-new Date(r.run_at).getTime()<7*86400000).reduce((s,r)=>s+Number(r.distance_km),0);
    const longest = runs.reduce((m, r) => Math.max(m, Number(r.distance_km)), 0);
    const fastest = runs.filter(r=>Number(r.distance_km)>=1).reduce((m,r)=>m===0||r.avg_pace_seconds<m ? r.avg_pace_seconds : m, 0);
    return { totalKm, totalSec, avgPace, avgHr, load, weekKm, elev, steps, longest, fastest };
  }, [runs]);

  const chart = useMemo(() => runs.slice(0, 14).reverse().map((r, i) => ({ i: i+1, km: Number(conv(Number(r.distance_km)).toFixed(2)), pace: r.avg_pace_seconds/60 })), [runs, settings.units]);
  const weekly = useMemo(() => {
    const byWeek: Record<string, number> = {};
    runs.forEach(r => { const d = new Date(r.run_at); const wk = `${d.getFullYear()}-W${Math.ceil((d.getDate()+ new Date(d.getFullYear(),d.getMonth(),1).getDay())/7)}`; byWeek[wk] = (byWeek[wk]||0) + Number(r.distance_km); });
    return Object.entries(byWeek).slice(-8).map(([w, km]) => ({ w: w.slice(5), km: Number(conv(km).toFixed(1)) }));
  }, [runs, settings.units]);

  const addRun = async () => {
    const p = schema.safeParse({ ...form, route: form.route || "Untitled run" }); if (!p.success) return toast.error("Check the route, distance and time fields.");
    const dur = parseDur(p.data.duration), dist = p.data.distance, pace = Math.round(dur/dist);
    const steps = Math.round(dist * 1350);
    const { error } = await supabase.from("runs").insert({ user_id: session.user.id, route_name: p.data.route, distance_km: dist, duration_seconds: dur, avg_pace_seconds: pace, avg_heart_rate: p.data.hr ? Number(p.data.hr) : null, effort: p.data.effort, calories: Math.round(dist*72), elevation_m: Math.round(dist*9), step_count: steps, notes: p.data.notes || null, visibility: settings.default_run_visibility });
    if (error) return toast.error(error.message);
    toast.success(`Run logged · +${Math.round(dist*10)+p.data.effort} XP`);
    setForm(f=>({...f, notes:""})); load(); refreshProfile();
  };
  const addGoal = async () => {
    const { error } = await supabase.from("goals").insert({ user_id: session.user.id, title: goalForm.title, target_value: Number(goalForm.target), unit: "km", current_value: 0 });
    if (error) return toast.error(error.message);
    toast.success("Goal created"); load();
  };

  const wkGoal = settings.weekly_km_goal || 30;
  const visibleRuns = showAll ? runs : runs.slice(0, 8);

  // Motivating level engine — quadratic curve so leveling stays meaningful
  const xp = profile?.xp ?? 0;
  const level = Math.floor(0.1 * Math.sqrt(xp)) + 1; // L1=0, L2=100, L3=400, L4=900...
  const xpForLevel = (l: number) => Math.pow((l-1)/0.1, 2);
  const cur = xpForLevel(level), nxt = xpForLevel(level+1);
  const lvlPct = Math.min(100, ((xp - cur)/(nxt - cur))*100);
  const streak = profile?.streak_days ?? 0;
  const mult = 1 + Math.min(streak, 14)*0.05;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/90 p-6 text-primary-foreground md:p-8">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-15" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">{t("welcome_back")}</div>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{profile?.display_name || "Runner"}</h1>
            <p className="mt-1 text-sm opacity-70">{conv(stats.weekKm).toFixed(1)} of {conv(wkGoal).toFixed(0)} {unit} this week</p>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">level</div>
              <div className="flex items-baseline gap-1 text-4xl font-semibold tabular-nums">L{level}<span className="text-sm opacity-60">·{xp.toLocaleString()} XP</span></div>
              <div className="font-mono-tech text-xs opacity-60">🔥 {streak}d streak · ×{mult.toFixed(2)} XP</div>
            </div>
            <Button onClick={() => nav("/app/run?start=1")} size="lg" className="rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90">
              <Play className="h-4 w-4" /> Start GPS run
            </Button>
          </div>
        </div>
        <div className="relative mt-6 space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-widest opacity-60"><span>Weekly distance</span><span>{Math.min(100,(stats.weekKm/wkGoal)*100).toFixed(0)}%</span></div>
            <Progress value={Math.min(100, (stats.weekKm/wkGoal)*100)} className="h-2 bg-primary-foreground/20" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-widest opacity-60"><span>Level {level} → {level+1}</span><span>{Math.round(nxt - xp)} XP to go</span></div>
            <div className="relative h-2 overflow-hidden rounded-full bg-primary-foreground/20">
              <motion.div initial={{ width: 0 }} animate={{ width: `${lvlPct}%` }} transition={{ duration: 0.7 }} className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
          <div className="flex items-center justify-between text-amber-500"><span className="font-mono-tech text-[10px] uppercase tracking-widest">streak bonus</span><Flame className="h-4 w-4" /></div>
          <div className="mt-1 text-2xl font-semibold">×{mult.toFixed(2)} XP</div>
          <div className="text-xs text-muted-foreground">Run today to keep your {streak}d chain · max ×1.70</div>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
          <div className="flex items-center justify-between text-emerald-500"><span className="font-mono-tech text-[10px] uppercase tracking-widest">next reward</span><Sparkles className="h-4 w-4" /></div>
          <div className="mt-1 text-2xl font-semibold">{Math.max(0, Math.round(nxt - xp))} XP</div>
          <div className="text-xs text-muted-foreground">≈ {Math.max(1, Math.ceil((nxt - xp)/(10*mult)))} km at current bonus to hit L{level+1}</div>
        </div>
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-transparent p-4">
          <div className="flex items-center justify-between text-cyan-500"><span className="font-mono-tech text-[10px] uppercase tracking-widest">side quests</span><Zap className="h-4 w-4" /></div>
          <div className="mt-1 text-2xl font-semibold">+up to 250 XP</div>
          <div className="text-xs text-muted-foreground">5 fresh challenges every day in Communities · Side Quests</div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[{l:t("distance"),v:`${conv(stats.totalKm).toFixed(1)} ${unit}`,s:`${runs.length} runs`,i:Route},{l:t("avg_pace"),v:`${fmtPace(stats.avgPace)}/${unit}`,s:"all time",i:Activity},{l:t("load"),v:stats.load.toFixed(0),s:"effort × km",i:Flame},{l:t("heart"),v:stats.avgHr?`${Math.round(stats.avgHr)} bpm`:"—",s:"avg HR",i:HeartPulse}].map((s,i)=>(
          <motion.div key={s.l} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.05}} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">{s.l}</span><s.i className="h-4 w-4" /></div>
            <div className="mt-4 text-3xl font-semibold tracking-tight">{s.v}</div>
            <div className="mt-1 text-xs text-muted-foreground">{s.s}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Last 14 runs · distance</h2>
          <div className="mt-4 h-64">
            {chart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="i" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="km" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="grid h-full place-items-center text-sm text-muted-foreground">Log your first run to see trends</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{t("log_run")}</h2><Plus className="h-4 w-4 text-muted-foreground" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input value={form.route} onChange={(e)=>setForm({...form,route:e.target.value})} placeholder="Route name" />
            <Input value={form.distance} onChange={(e)=>setForm({...form,distance:e.target.value})} placeholder={`${unit}`} />
            <Input value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} placeholder="MM:SS" />
            <Input value={form.hr} onChange={(e)=>setForm({...form,hr:e.target.value})} placeholder="HR" />
            <Input value={form.effort} onChange={(e)=>setForm({...form,effort:e.target.value})} placeholder="Effort 1-10" className="sm:col-span-2" />
          </div>
          <Textarea className="mt-3" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Notes…" />
          <Button onClick={addRun} className="mt-3 w-full rounded-xl">{t("save_run")}</Button>
        </div>
      </div>

      {/* Lifetime stats */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("lifetime")}</h2>
            <p className="text-xs text-muted-foreground">Aggregate of every kilometer you've logged.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportRunsPdf({ name: profile?.display_name || "Runner", xp: profile?.xp || 0, streak: profile?.streak_days || 0, runs })}>
            <FileDown className="h-4 w-4" /> {t("export_pdf")}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Lifetime distance", v: `${conv(stats.totalKm).toFixed(1)} ${unit}`, i: Route },
            { l: "Total time", v: fmtDur(stats.totalSec), i: Clock },
            { l: "Elevation gained", v: `${stats.elev} m`, i: Mountain },
            { l: "Steps", v: stats.steps.toLocaleString(), i: Footprints },
            { l: "Longest run", v: `${conv(stats.longest).toFixed(1)} ${unit}`, i: Trophy },
            { l: "Fastest pace (≥1km)", v: stats.fastest ? `${fmtPace(stats.fastest)}/${unit}` : "—", i: Gauge },
            { l: "Training load", v: stats.load.toFixed(0), i: Flame },
            { l: "Avg HR", v: stats.avgHr ? `${Math.round(stats.avgHr)} bpm` : "—", i: HeartPulse },
          ].map((s) => (
            <div key={s.l} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">{s.l}</span><s.i className="h-3 w-3" /></div>
              <div className="mt-2 text-2xl font-semibold">{s.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 h-44">
          <div className="mb-2 text-xs text-muted-foreground">Last 8 weeks</div>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="w" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="km" fill="hsl(var(--accent))" radius={[8,8,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-4 w-4" /> Goals</h2></div>
          <div className="space-y-3">
            {goals.length === 0 && <div className="text-sm text-muted-foreground">No goals yet.</div>}
            {goals.map((g) => (
              <div key={g.id} className="rounded-xl border border-border p-4">
                <div className="flex justify-between text-sm"><span className="font-medium">{g.title} {g.status === "complete" && <span className="ml-2 text-[10px] uppercase tracking-widest text-accent">done</span>}</span><span className="font-mono-tech text-xs text-muted-foreground">{Number(g.current_value).toFixed(1)}/{g.target_value} {g.unit}</span></div>
                <Progress value={Math.min(100,(Number(g.current_value)/Number(g.target_value))*100)} className="mt-2 h-1.5" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Input value={goalForm.title} onChange={(e)=>setGoalForm({...goalForm,title:e.target.value})} placeholder="Goal title" />
              <Input value={goalForm.target} onChange={(e)=>setGoalForm({...goalForm,target:e.target.value})} placeholder="km" className="w-24" />
              <Button onClick={addGoal} variant="outline">Add</Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-4 w-4" /> {t("history")}</h2>
            <span className="font-mono-tech text-[10px] text-muted-foreground">{runs.length} runs</span>
          </div>
          <div className="divide-y divide-border">
            {visibleRuns.map((r) => (
              <button key={r.id} onClick={() => setDetail(r)} className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:bg-muted/50 -mx-2 px-2 rounded-lg">
                <div><div className="font-medium">{r.route_name}</div><div className="text-xs text-muted-foreground">{new Date(r.run_at).toLocaleDateString()} · effort {r.effort}/10</div></div>
                <div className="flex items-center gap-3">
                  <div className="text-right font-mono-tech text-sm"><div>{conv(Number(r.distance_km)).toFixed(1)} {unit}</div><div className="text-xs text-muted-foreground">{fmtPace(r.avg_pace_seconds)}/{unit}</div></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
            {runs.length === 0 && <div className="py-6 text-sm text-muted-foreground">Your runs will appear here.</div>}
          </div>
          {runs.length > 8 && (
            <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll(s => !s)}>
              {showAll ? "Show less" : `Show all ${runs.length}`}
            </Button>
          )}
        </div>
      </div>

      <RunDetailDialog run={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
