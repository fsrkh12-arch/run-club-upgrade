import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, Check, ChevronRight, Flame, Goal, HeartPulse, LogOut, MessageCircle, Plus, Radio, Route, Send, Shield, Trophy, Users, Zap } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Session } from "@supabase/supabase-js";

type Run = {
  id: string;
  route_name: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace_seconds: number;
  avg_heart_rate: number | null;
  elevation_m: number;
  effort: number;
  calories: number | null;
  notes: string | null;
  visibility: string;
  run_at: string;
};

type Profile = {
  user_id: string;
  display_name: string;
  handle: string | null;
  avatar_initials: string;
  weekly_km_goal: number;
  runner_level: string;
  city: string;
};

type GoalRow = {
  id: string;
  title: string;
  target_value: number;
  current_value: number;
  unit: string;
  due_date: string | null;
  status: string;
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  category: string;
  route_name: string | null;
  distance_km: number | null;
  pace_seconds: number | null;
  created_at: string;
};

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  target_km: number;
  ends_on: string;
  badge_label: string;
};

type ChallengeMember = {
  challenge_id: string;
  progress_km: number;
};

const runSchema = z.object({
  route: z.string().trim().min(2).max(80),
  distance: z.coerce.number().min(0.1).max(200),
  duration: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
  hr: z.coerce.number().min(40).max(230).optional().or(z.literal("")),
  effort: z.coerce.number().min(1).max(10),
  notes: z.string().trim().max(500).optional(),
});

const goalSchema = z.object({
  title: z.string().trim().min(3).max(80),
  target: z.coerce.number().min(1).max(1000),
});

const postSchema = z.object({
  content: z.string().trim().min(3).max(500),
});

const parseDuration = (value: string) => {
  const parts = value.split(":").map(Number);
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
};

const formatPace = (seconds?: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
};

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};

const demoMembers = [
  { name: "Leyla M.", km: 87.4, pace: "5:13", streak: 21, initials: "LM" },
  { name: "Rashad A.", km: 74.2, pace: "5:28", streak: 14, initials: "RA" },
  { name: "Nigar K.", km: 68.9, pace: "5:21", streak: 18, initials: "NK" },
];

const demoPosts = [
  { id: "demo-1", user_id: "demo", content: "Bulvar crew run at 07:10 tomorrow. Negative split plan, 8K steady.", category: "meetup", route_name: "Bulvar Coastal", distance_km: 8, pace_seconds: 330, created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString() },
  { id: "demo-2", user_id: "demo", content: "Highland route is clear again. Wind is heavy after km 4, save your legs.", category: "route", route_name: "Highland Park", distance_km: 10, pace_seconds: 362, created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString() },
];

function AuthGate() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || password.length < 6) return toast.error("Use a valid email and 6+ character password.");
    setLoading(true);
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) return toast.error(result.error.message);
    toast.success(mode === "signup" ? "Check your email to confirm your account." : "Signed in.");
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) toast.error(String(result.error.message || result.error));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
        <section className="flex flex-col justify-between border-r border-border bg-primary p-6 text-primary-foreground md:p-10">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center border border-primary-foreground/20"><Radio className="h-5 w-5" /></div><span className="font-mono-tech text-sm uppercase tracking-[0.22em]">Run Club OS</span></div>
          <div className="max-w-3xl py-20">
            <Badge className="mb-6 border-primary-foreground/20 bg-primary-foreground text-primary">Live athlete data</Badge>
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.95] md:text-7xl">Track the work. Read the signal. Move with the club.</h1>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {["GPS-ready run logs", "Load + pace analysis", "Community challenges"].map((item) => <div key={item} className="border border-primary-foreground/15 p-4 font-mono-tech text-xs uppercase tracking-[0.14em] text-primary-foreground/70">{item}</div>)}
            </div>
          </div>
          <div className="font-mono-tech text-xs uppercase tracking-[0.18em] text-primary-foreground/50">White/black training system · Baku</div>
        </section>
        <section className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-sm">
            <h2 className="text-2xl font-semibold">Member access</h2>
            <p className="mt-2 text-sm text-muted-foreground">Save runs, analyze progress, post updates, and join club challenges.</p>
            <div className="mt-6 grid grid-cols-2 border border-border p-1">
              <button onClick={() => setMode("signin")} className={cn("px-3 py-2 text-sm", mode === "signin" && "bg-primary text-primary-foreground")}>Sign in</button>
              <button onClick={() => setMode("signup")} className={cn("px-3 py-2 text-sm", mode === "signup" && "bg-primary text-primary-foreground")}>Create account</button>
            </div>
            <div className="mt-5 space-y-3">
              <Input type="email" placeholder="email@club.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button className="w-full" onClick={submit} disabled={loading}>{loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
              <Button className="w-full" variant="outline" onClick={google}>Continue with Google</Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatTile({ label, value, sub, icon: Icon }: { label: string; value: string; sub: string; icon: typeof Activity }) {
  return <div className="border border-border bg-card p-4"><div className="mb-5 flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[11px] uppercase tracking-[0.18em]">{label}</span><Icon className="h-4 w-4" /></div><div className="text-3xl font-semibold">{value}</div><div className="mt-1 text-sm text-muted-foreground">{sub}</div></div>;
}

export default function RunClubApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [memberships, setMemberships] = useState<ChallengeMember[]>([]);
  const [runForm, setRunForm] = useState({ route: "Bulvar Coastal", distance: "5.0", duration: "28:30", hr: "154", effort: "6", notes: "" });
  const [goalForm, setGoalForm] = useState({ title: "Weekly distance", target: "40" });
  const [postText, setPostText] = useState("");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadData = async () => {
    if (!userId) return;
    const emailName = session?.user.email?.split("@")[0] || "Runner";
    await supabase.from("profiles").upsert({ user_id: userId, display_name: emailName, handle: emailName.toLowerCase(), avatar_initials: emailName.slice(0, 2).toUpperCase() }, { onConflict: "user_id" });
    const [profileRes, runsRes, goalsRes, postsRes, profilesRes, challengesRes, membershipsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("runs").select("*").order("run_at", { ascending: false }),
      supabase.from("goals").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("community_posts").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("profiles").select("*"),
      supabase.from("challenges").select("*").order("ends_on", { ascending: true }),
      supabase.from("challenge_members").select("challenge_id, progress_km").eq("user_id", userId),
    ]);
    if (profileRes.data) setProfile(profileRes.data);
    setRuns((runsRes.data || []) as Run[]);
    setGoals((goalsRes.data || []) as GoalRow[]);
    setPosts([...(postsRes.data || []), ...demoPosts] as Post[]);
    setProfiles(Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p as Profile])));
    setChallenges((challengesRes.data || []) as Challenge[]);
    setMemberships((membershipsRes.data || []) as ChallengeMember[]);
  };

  useEffect(() => { loadData(); }, [userId]);

  const stats = useMemo(() => {
    const totalKm = runs.reduce((sum, run) => sum + Number(run.distance_km), 0);
    const totalSeconds = runs.reduce((sum, run) => sum + Number(run.duration_seconds), 0);
    const avgPace = totalKm ? totalSeconds / totalKm : 0;
    const avgHr = runs.filter((r) => r.avg_heart_rate).reduce((sum, r) => sum + Number(r.avg_heart_rate), 0) / Math.max(1, runs.filter((r) => r.avg_heart_rate).length);
    const load = runs.reduce((sum, r) => sum + Number(r.effort) * Number(r.distance_km), 0);
    const weekKm = runs.filter((r) => Date.now() - new Date(r.run_at).getTime() < 7 * 86400000).reduce((sum, r) => sum + Number(r.distance_km), 0);
    return { totalKm, totalSeconds, avgPace, avgHr, load, weekKm };
  }, [runs]);

  const addRun = async () => {
    if (!userId) return;
    const parsed = runSchema.safeParse(runForm);
    if (!parsed.success) return toast.error("Check route, distance, duration, HR, and effort fields.");
    const duration = parseDuration(parsed.data.duration);
    const distance = parsed.data.distance;
    const pace = Math.round(duration / distance);
    const { error } = await supabase.from("runs").insert({ user_id: userId, route_name: parsed.data.route, distance_km: distance, duration_seconds: duration, avg_pace_seconds: pace, avg_heart_rate: parsed.data.hr === "" ? null : Number(parsed.data.hr), effort: parsed.data.effort, calories: Math.round(distance * 72 * 1.036), elevation_m: Math.round(distance * 9), notes: parsed.data.notes || null, visibility: "public" });
    if (error) return toast.error(error.message);
    toast.success("Run logged.");
    setRunForm((f) => ({ ...f, notes: "" }));
    loadData();
  };

  const addGoal = async () => {
    if (!userId) return;
    const parsed = goalSchema.safeParse(goalForm);
    if (!parsed.success) return toast.error("Goal needs a title and target number.");
    const { error } = await supabase.from("goals").insert({ user_id: userId, title: parsed.data.title, target_value: parsed.data.target, current_value: stats.weekKm, unit: "km", due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) });
    if (error) return toast.error(error.message);
    toast.success("Goal created.");
    loadData();
  };

  const addPost = async () => {
    if (!userId) return;
    const parsed = postSchema.safeParse({ content: postText });
    if (!parsed.success) return toast.error("Post must be 3–500 characters.");
    const latest = runs[0];
    const { error } = await supabase.from("community_posts").insert({ user_id: userId, content: parsed.data.content, category: "update", route_name: latest?.route_name || null, distance_km: latest?.distance_km || null, pace_seconds: latest?.avg_pace_seconds || null });
    if (error) return toast.error(error.message);
    setPostText("");
    toast.success("Posted to club feed.");
    loadData();
  };

  const joinChallenge = async (challengeId: string) => {
    if (!userId) return;
    const { error } = await supabase.from("challenge_members").upsert({ user_id: userId, challenge_id: challengeId, progress_km: stats.weekKm }, { onConflict: "challenge_id,user_id" });
    if (error) return toast.error(error.message);
    toast.success("Challenge synced.");
    loadData();
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-background font-mono-tech text-xs uppercase tracking-[0.2em]">Loading run system…</div>;
  if (!session) return <AuthGate />;

  const weeklyGoal = profile?.weekly_km_goal || 30;
  const paceTrend = runs.slice(0, 8).reverse();
  const memberRows = [{ name: profile?.display_name || "You", km: Number(stats.weekKm.toFixed(1)), pace: formatPace(stats.avgPace), streak: Math.min(9, runs.length), initials: profile?.avatar_initials || "YO" }, ...demoMembers].sort((a, b) => b.km - a.km);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div><div><div className="font-semibold">Run Club OS</div><div className="font-mono-tech text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Training · Data · Community</div></div></div>
          <div className="flex items-center gap-3"><Badge variant="outline" className="hidden rounded-none md:inline-flex">{profile?.runner_level || "building"}</Badge><Avatar className="rounded-none"><AvatarFallback className="rounded-none bg-primary text-primary-foreground">{profile?.avatar_initials || "RC"}</AvatarFallback></Avatar><Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /></Button></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 md:p-6 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)]">
          <div className="border border-border bg-card p-4"><div className="font-mono-tech text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Athlete</div><h2 className="mt-3 text-3xl font-semibold">{profile?.display_name || "Runner"}</h2><p className="text-sm text-muted-foreground">@{profile?.handle || "runclub"} · {profile?.city || "Baku"}</p><div className="mt-5"><div className="mb-2 flex justify-between text-sm"><span>Weekly target</span><span>{stats.weekKm.toFixed(1)} / {weeklyGoal} km</span></div><Progress value={Math.min(100, (stats.weekKm / weeklyGoal) * 100)} className="h-2 rounded-none" /></div></div>
          <div className="border border-border bg-primary p-4 text-primary-foreground"><Shield className="mb-5 h-5 w-5" /><div className="text-xl font-semibold">Club-ready data</div><p className="mt-2 text-sm text-primary-foreground/65">Your private goals and run history are protected. Public runs and posts power the community feed.</p></div>
        </aside>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Distance" value={`${stats.totalKm.toFixed(1)} km`} sub={`${runs.length} runs logged`} icon={Route} />
            <StatTile label="Avg pace" value={`${formatPace(stats.avgPace)} /km`} sub="Weighted by distance" icon={Activity} />
            <StatTile label="Load" value={stats.load.toFixed(0)} sub="Effort × kilometers" icon={Flame} />
            <StatTile label="Heart" value={stats.avgHr ? `${Math.round(stats.avgHr)} bpm` : "—"} sub="Average session HR" icon={HeartPulse} />
          </div>

          <Tabs defaultValue="track" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-4 rounded-none bg-muted p-1"><TabsTrigger value="track" className="rounded-none">Track</TabsTrigger><TabsTrigger value="analyze" className="rounded-none">Analyze</TabsTrigger><TabsTrigger value="goals" className="rounded-none">Goals</TabsTrigger><TabsTrigger value="club" className="rounded-none">Club</TabsTrigger></TabsList>

            <TabsContent value="track" className="mt-0 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
              <div className="border border-border bg-card p-4"><div className="mb-5 flex items-center justify-between"><h2 className="text-2xl font-semibold">Log run</h2><Plus className="h-5 w-5" /></div><div className="grid gap-3 sm:grid-cols-2"><Input value={runForm.route} onChange={(e) => setRunForm({ ...runForm, route: e.target.value })} placeholder="Route" /><Input value={runForm.distance} onChange={(e) => setRunForm({ ...runForm, distance: e.target.value })} placeholder="Distance km" /><Input value={runForm.duration} onChange={(e) => setRunForm({ ...runForm, duration: e.target.value })} placeholder="MM:SS" /><Input value={runForm.hr} onChange={(e) => setRunForm({ ...runForm, hr: e.target.value })} placeholder="Avg HR" /><Input value={runForm.effort} onChange={(e) => setRunForm({ ...runForm, effort: e.target.value })} placeholder="Effort 1-10" /><Input disabled value="Public club run" /></div><Textarea className="mt-3" value={runForm.notes} onChange={(e) => setRunForm({ ...runForm, notes: e.target.value })} placeholder="Notes, conditions, splits…" /><Button onClick={addRun} className="mt-4 w-full">Save run</Button></div>
              <div className="border border-border bg-card p-4"><h2 className="mb-4 text-2xl font-semibold">Run history</h2><div className="space-y-2">{runs.length === 0 && <div className="border border-dashed border-border p-8 text-center text-muted-foreground">No runs yet. Log the first one.</div>}{runs.slice(0, 8).map((run) => <div key={run.id} className="grid grid-cols-[1fr_auto] gap-3 border border-border p-3"><div><div className="font-medium">{run.route_name}</div><div className="text-sm text-muted-foreground">{new Date(run.run_at).toLocaleDateString()} · {run.notes || "Controlled effort"}</div></div><div className="text-right font-mono-tech text-sm"><div>{Number(run.distance_km).toFixed(2)} km</div><div className="text-muted-foreground">{formatPace(run.avg_pace_seconds)}/km</div></div></div>)}</div></div>
            </TabsContent>

            <TabsContent value="analyze" className="mt-0 grid gap-4 xl:grid-cols-3">
              <div className="border border-border bg-card p-4 xl:col-span-2"><div className="mb-6 flex items-center justify-between"><h2 className="text-2xl font-semibold">Pace trend</h2><BarChart3 className="h-5 w-5" /></div><div className="flex h-64 items-end gap-2 border-b border-l border-border p-3">{(paceTrend.length ? paceTrend : [{ id: "empty", avg_pace_seconds: 360, distance_km: 0 } as Run]).map((run) => { const height = Math.max(12, 100 - ((run.avg_pace_seconds || 360) - 240) / 2); return <div key={run.id} className="flex flex-1 flex-col items-center gap-2"><div className="w-full bg-primary" style={{ height: `${Math.min(100, height)}%` }} /><span className="font-mono-tech text-[10px] text-muted-foreground">{formatPace(run.avg_pace_seconds)}</span></div>; })}</div></div>
              <div className="border border-border bg-card p-4"><h2 className="mb-5 text-2xl font-semibold">Signals</h2><div className="space-y-4">{[{ label: "Aerobic base", value: Math.min(100, stats.weekKm / weeklyGoal * 100) }, { label: "Consistency", value: Math.min(100, runs.length * 12) }, { label: "Load balance", value: Math.min(100, stats.load / 5) }].map((s) => <div key={s.label}><div className="mb-2 flex justify-between text-sm"><span>{s.label}</span><span>{Math.round(s.value)}%</span></div><Progress value={s.value} className="h-2 rounded-none" /></div>)}</div></div>
            </TabsContent>

            <TabsContent value="goals" className="mt-0 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
              <div className="border border-border bg-card p-4"><h2 className="mb-4 text-2xl font-semibold">Create goal</h2><Input className="mb-3" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} /><Input className="mb-3" value={goalForm.target} onChange={(e) => setGoalForm({ ...goalForm, target: e.target.value })} placeholder="Target km" /><Button onClick={addGoal} className="w-full"><Goal className="h-4 w-4" /> Add goal</Button></div>
              <div className="grid gap-3 md:grid-cols-2">{goals.map((goal) => <div key={goal.id} className="border border-border bg-card p-4"><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">{goal.title}</h3><CalendarDays className="h-4 w-4 text-muted-foreground" /></div><div className="text-3xl font-semibold">{Number(goal.current_value).toFixed(1)} / {Number(goal.target_value).toFixed(0)} {goal.unit}</div><Progress value={Math.min(100, Number(goal.current_value) / Number(goal.target_value) * 100)} className="mt-4 h-2 rounded-none" /></div>)}</div>
            </TabsContent>

            <TabsContent value="club" className="mt-0 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <div className="space-y-4"><div className="border border-border bg-card p-4"><h2 className="mb-4 text-2xl font-semibold">Community feed</h2><div className="flex gap-2"><Input value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="Share a run, route note, meetup…" /><Button size="icon" onClick={addPost}><Send className="h-4 w-4" /></Button></div></div>{posts.map((post) => { const p = profiles[post.user_id]; return <div key={post.id} className="border border-border bg-card p-4"><div className="mb-3 flex items-center gap-3"><Avatar className="rounded-none"><AvatarFallback className="rounded-none">{p?.avatar_initials || "RC"}</AvatarFallback></Avatar><div><div className="font-medium">{p?.display_name || "Run Club"}</div><div className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleString()}</div></div></div><p className="text-sm leading-6">{post.content}</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="secondary" className="rounded-none"><MessageCircle className="mr-1 h-3 w-3" />{post.category}</Badge>{post.distance_km && <Badge variant="outline" className="rounded-none">{Number(post.distance_km).toFixed(1)} km</Badge>}{post.pace_seconds && <Badge variant="outline" className="rounded-none">{formatPace(post.pace_seconds)}/km</Badge>}</div></div>; })}</div>
              <div className="space-y-4"><div className="border border-border bg-card p-4"><h2 className="mb-4 text-2xl font-semibold">Leaderboard</h2>{memberRows.map((m, index) => <div key={m.name} className="flex items-center justify-between border-b border-border py-3 last:border-0"><div className="flex items-center gap-3"><span className="font-mono-tech text-xs text-muted-foreground">#{index + 1}</span><Avatar className="rounded-none"><AvatarFallback className="rounded-none bg-muted">{m.initials}</AvatarFallback></Avatar><div><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.streak} day streak · {m.pace}/km</div></div></div><div className="font-mono-tech text-sm">{m.km} km</div></div>)}</div><div className="border border-border bg-card p-4"><h2 className="mb-4 text-2xl font-semibold">Challenges</h2><div className="space-y-3">{challenges.map((c) => { const joined = memberships.find((m) => m.challenge_id === c.id); const progress = joined?.progress_km || 0; return <div key={c.id} className="border border-border p-3"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{c.title}</div><p className="mt-1 text-sm text-muted-foreground">{c.description}</p></div><Trophy className="h-4 w-4" /></div><Progress value={Math.min(100, progress / Number(c.target_km) * 100)} className="mt-4 h-2 rounded-none" /><Button variant="outline" className="mt-3 w-full rounded-none" onClick={() => joinChallenge(c.id)}>{joined ? <Check className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} {joined ? "Synced" : "Join"}</Button></div>; })}</div></div></div>
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </main>
  );
}