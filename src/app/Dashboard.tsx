import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, Flame, HeartPulse, Plus, Route, Trophy, Target } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

type Run = { id: string; route_name: string; distance_km: number; duration_seconds: number; avg_pace_seconds: number; avg_heart_rate: number | null; effort: number; run_at: string; notes: string | null };
type Goal = { id: string; title: string; target_value: number; current_value: number; unit: string; status: string };

const schema = z.object({ route: z.string().trim().min(2).max(80), distance: z.coerce.number().min(0.1).max(200), duration: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/), hr: z.string().optional(), effort: z.coerce.number().min(1).max(10), notes: z.string().max(500).optional() });

const parseDur = (v: string) => { const p = v.split(":").map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
const fmtPace = (s?: number | null) => !s || !isFinite(s) ? "—" : `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;

export default function Dashboard() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [form, setForm] = useState({ route: "Bulvar Coastal", distance: "5.0", duration: "27:30", hr: "152", effort: "6", notes: "" });
  const [goalForm, setGoalForm] = useState({ title: "Weekly distance", target: "40" });

  const load = async () => {
    const [r, g] = await Promise.all([
      supabase.from("runs").select("*").eq("user_id", session.user.id).order("run_at", { ascending: false }).limit(50),
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
    const weekKm = runs.filter(r => Date.now()-new Date(r.run_at).getTime()<7*86400000).reduce((s,r)=>s+Number(r.distance_km),0);
    return { totalKm, avgPace, avgHr, load, weekKm };
  }, [runs]);

  const chart = useMemo(() => runs.slice(0, 14).reverse().map((r, i) => ({ i: i+1, km: Number(r.distance_km), pace: r.avg_pace_seconds/60 })), [runs]);

  const addRun = async () => {
    const p = schema.safeParse(form); if (!p.success) return toast.error("Check fields.");
    const dur = parseDur(p.data.duration), dist = p.data.distance, pace = Math.round(dur/dist);
    const { error } = await supabase.from("runs").insert({ user_id: session.user.id, route_name: p.data.route, distance_km: dist, duration_seconds: dur, avg_pace_seconds: pace, avg_heart_rate: p.data.hr ? Number(p.data.hr) : null, effort: p.data.effort, calories: Math.round(dist*72), elevation_m: Math.round(dist*9), notes: p.data.notes || null, visibility: "private" });
    if (error) return toast.error(error.message);
    toast.success(`Run logged · +${Math.round(dist*10)+p.data.effort} XP`);
    setForm(f=>({...f, notes:""})); load(); refreshProfile();
  };

  const addGoal = async () => {
    const { error } = await supabase.from("goals").insert({ user_id: session.user.id, title: goalForm.title, target_value: Number(goalForm.target), unit: "km", current_value: stats.weekKm });
    if (error) return toast.error(error.message);
    toast.success("Goal created"); load();
  };

  const wkGoal = profile?.weekly_km_goal || 30;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/90 p-6 text-primary-foreground md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">Welcome back</div>
            <h1 className="mt-1 text-3xl font-semibold md:text-4xl">{profile?.display_name || "Runner"}</h1>
            <p className="mt-1 text-sm opacity-70">{stats.weekKm.toFixed(1)} of {wkGoal} km this week</p>
          </div>
          <div className="text-right">
            <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">Total XP</div>
            <div className="text-4xl font-semibold">{profile?.xp ?? 0}</div>
          </div>
        </div>
        <div className="mt-6"><Progress value={Math.min(100, (stats.weekKm/wkGoal)*100)} className="h-2 bg-primary-foreground/20" /></div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[{l:"Distance",v:`${stats.totalKm.toFixed(1)} km`,s:`${runs.length} runs`,i:Route},{l:"Avg pace",v:`${fmtPace(stats.avgPace)}/km`,s:"all time",i:Activity},{l:"Load",v:stats.load.toFixed(0),s:"effort × km",i:Flame},{l:"Heart",v:stats.avgHr?`${Math.round(stats.avgHr)} bpm`:"—",s:"avg HR",i:HeartPulse}].map((s,i)=>(
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
                  <Line type="monotone" dataKey="km" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="grid h-full place-items-center text-sm text-muted-foreground">Log your first run to see trends</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Log run</h2><Plus className="h-4 w-4 text-muted-foreground" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input value={form.route} onChange={(e)=>setForm({...form,route:e.target.value})} placeholder="Route" />
            <Input value={form.distance} onChange={(e)=>setForm({...form,distance:e.target.value})} placeholder="km" />
            <Input value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} placeholder="MM:SS" />
            <Input value={form.hr} onChange={(e)=>setForm({...form,hr:e.target.value})} placeholder="HR" />
            <Input value={form.effort} onChange={(e)=>setForm({...form,effort:e.target.value})} placeholder="Effort 1-10" className="sm:col-span-2" />
          </div>
          <Textarea className="mt-3" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="Notes…" />
          <Button onClick={addRun} className="mt-3 w-full rounded-xl">Save run · earn XP</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><Target className="h-4 w-4" /> Goals</h2></div>
          <div className="space-y-3">
            {goals.length === 0 && <div className="text-sm text-muted-foreground">No goals yet.</div>}
            {goals.map((g) => (
              <div key={g.id} className="rounded-xl border border-border p-4">
                <div className="flex justify-between text-sm"><span className="font-medium">{g.title}</span><span className="font-mono-tech text-xs text-muted-foreground">{Number(g.current_value).toFixed(1)}/{g.target_value} {g.unit}</span></div>
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
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Trophy className="h-4 w-4" /> Recent runs</h2>
          <div className="mt-4 divide-y divide-border">
            {runs.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3">
                <div><div className="font-medium">{r.route_name}</div><div className="text-xs text-muted-foreground">{new Date(r.run_at).toLocaleDateString()} · effort {r.effort}/10</div></div>
                <div className="text-right font-mono-tech text-sm"><div>{Number(r.distance_km).toFixed(1)} km</div><div className="text-xs text-muted-foreground">{fmtPace(r.avg_pace_seconds)}/km</div></div>
              </div>
            ))}
            {runs.length === 0 && <div className="py-3 text-sm text-muted-foreground">Your runs will appear here.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
