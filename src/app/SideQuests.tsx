import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Swords, Check, Flame, Sparkles, Trophy, Mountain, Footprints, Timer, Gauge, Route, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type Quest = { id: string; day: string; slot: number; title: string; description: string; kind: string; threshold: number; difficulty: string; xp_reward: number };
type Completion = { quest_id: string; xp_awarded: number; completed_at: string };
type Run = { id: string; distance_km: number; duration_seconds: number; elevation_m: number; effort: number; avg_pace_seconds: number; step_count: number | null; run_at: string };

const ICONS: Record<string, any> = { distance: Route, duration: Timer, elevation: Mountain, steps: Footprints, pace: Gauge, effort: Flame };
const DIFF_COLOR: Record<string, string> = {
  easy: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/40 text-emerald-500",
  medium: "from-sky-500/20 to-sky-500/5 border-sky-500/40 text-sky-500",
  hard: "from-amber-500/20 to-amber-500/5 border-amber-500/40 text-amber-500",
  epic: "from-fuchsia-500/20 to-fuchsia-500/5 border-fuchsia-500/40 text-fuchsia-500",
};

const fmtThreshold = (q: Quest) => {
  switch (q.kind) {
    case "distance": return `${q.threshold} km`;
    case "duration": return `${Math.round(q.threshold/60)} min`;
    case "elevation": return `${q.threshold} m`;
    case "steps": return `${q.threshold.toLocaleString()} steps`;
    case "pace": return `≤ ${Math.floor(q.threshold/60)}:${String(q.threshold%60).padStart(2,"0")}/km`;
    case "effort": return `effort ${q.threshold}/10`;
    default: return String(q.threshold);
  }
};

const bestProgress = (q: Quest, runs: Run[]) => {
  const today = new Date().toDateString();
  const todays = runs.filter(r => new Date(r.run_at).toDateString() === today);
  if (!todays.length) return 0;
  switch (q.kind) {
    case "distance":  return Math.max(...todays.map(r => r.distance_km));
    case "duration":  return Math.max(...todays.map(r => r.duration_seconds));
    case "elevation": return Math.max(...todays.map(r => r.elevation_m || 0));
    case "steps":     return Math.max(...todays.map(r => r.step_count || Math.round(r.distance_km*1350)));
    case "effort":    return Math.max(...todays.map(r => r.effort));
    case "pace": {
      const fast = todays.filter(r => r.distance_km >= 4 && r.avg_pace_seconds > 0).map(r => r.avg_pace_seconds);
      if (!fast.length) return 0;
      const min = Math.min(...fast);
      // express as percent toward target
      return min <= q.threshold ? q.threshold : (q.threshold / min) * q.threshold;
    }
    default: return 0;
  }
};

export default function SideQuests({ session }: { session: any }) {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    await supabase.rpc("seed_daily_quests", { _day: new Date().toISOString().slice(0,10) }).then(()=>{}, ()=>{});
    const today = new Date().toISOString().slice(0,10);
    const since = new Date(Date.now() - 86400000*2).toISOString();
    const [q, c, r] = await Promise.all([
      supabase.from("side_quests").select("*").eq("day", today).order("slot"),
      supabase.from("side_quest_completions").select("quest_id, xp_awarded, completed_at").eq("user_id", session.user.id),
      supabase.from("runs").select("id, distance_km, duration_seconds, elevation_m, effort, avg_pace_seconds, step_count, run_at").eq("user_id", session.user.id).gte("run_at", since),
    ]);
    setQuests((q.data || []) as Quest[]);
    setCompletions((c.data || []) as Completion[]);
    setRuns((r.data || []) as Run[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Realtime — when completion lands, refresh
  useEffect(() => {
    const ch = supabase.channel(`quests:${session.user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "side_quest_completions", filter: `user_id=eq.${session.user.id}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const completedSet = useMemo(() => new Set(completions.map(c => c.quest_id)), [completions]);
  const totalXp = quests.reduce((s,q) => s + q.xp_reward, 0);
  const earnedXp = completions.filter(c => quests.some(q => q.id === c.quest_id)).reduce((s,c) => s + c.xp_awarded, 0);

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] opacity-60">// daily · ai-generated · 5 quests</div>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><Swords className="h-6 w-6" /> Side Quests</h1>
            <p className="mt-1 text-sm opacity-70">Five fresh challenges every day. Crush them on any run — XP scales with difficulty.</p>
          </div>
          <div className="text-right">
            <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] opacity-60">today's pool</div>
            <div className="text-3xl font-semibold tabular-nums"><span className="text-emerald-300">{earnedXp}</span><span className="opacity-50"> / {totalXp}</span> XP</div>
            <div className="font-mono-tech text-[11px] opacity-60">{completedSet.size}/{quests.length} cleared</div>
          </div>
        </div>
        <div className="relative mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div initial={{ width: 0 }} animate={{ width: `${totalXp ? (earnedXp/totalXp)*100 : 0}%` }} transition={{ duration: 0.6 }} className="h-full bg-emerald-400" />
        </div>
      </motion.div>

      <div className="grid gap-3 lg:grid-cols-2">
        {loading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading today's quests…</div>}
        {quests.map((q, i) => {
          const done = completedSet.has(q.id);
          const Icon = ICONS[q.kind] || Sparkles;
          const prog = Math.min(1, bestProgress(q, runs) / q.threshold);
          return (
            <motion.div key={q.id} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay: i*0.05 }}
              className={cn("group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition", done ? "from-emerald-500/15 to-background border-emerald-500/40" : `border-border bg-card hover:-translate-y-0.5`)}>
              <div className={cn("absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30 bg-gradient-to-br", DIFF_COLOR[q.difficulty])} />
              <div className="relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={cn("grid h-11 w-11 place-items-center rounded-xl border bg-gradient-to-br", DIFF_COLOR[q.difficulty])}>
                      {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full border px-2 py-0.5 font-mono-tech text-[9px] uppercase tracking-widest", DIFF_COLOR[q.difficulty])}>{q.difficulty}</span>
                        <span className="font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">target · {fmtThreshold(q)}</span>
                      </div>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">{q.title}</h3>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 font-mono-tech text-sm font-semibold text-amber-500"><Zap className="h-3 w-3" />+{q.xp_reward}</div>
                    <div className="font-mono-tech text-[9px] uppercase tracking-widest text-muted-foreground">xp</div>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{q.description}</p>
                <div className="mt-3 space-y-1">
                  <Progress value={done ? 100 : prog*100} className="h-1.5" />
                  <div className="flex items-center justify-between font-mono-tech text-[10px] text-muted-foreground">
                    <span>{done ? "✓ cleared" : `${Math.round(prog*100)}% today`}</span>
                    <span>{done ? "Locked in" : "Log a qualifying run"}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        <Trophy className="mx-auto mb-1 h-4 w-4" /> Quests reset daily at midnight · everyone in the club gets the same 5
      </div>
    </div>
  );
}