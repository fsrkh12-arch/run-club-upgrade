import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { Activity, Users, Trophy, Settings, LogOut, Zap, Flame, Map as MapIcon, Bell, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SettingsProvider } from "@/lib/settings-context";

export type AppProfile = { user_id: string; display_name: string; avatar_initials: string; handle: string | null; city: string; xp: number; streak_days: number; weekly_km_goal: number; runner_level: string };

export default function AppLayout() {
  const nav = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) nav("/auth", { replace: true }); });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); if (!data.session) nav("/auth", { replace: true }); });
    return () => l.subscription.unsubscribe();
  }, [nav]);

  const refreshProfile = async () => { if (!session) return; const { data } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle(); setProfile(data as AppProfile); };

  useEffect(() => {
    if (!session) return;
    const id = session.user.id;
    (async () => {
      let { data } = await supabase.from("profiles").select("*").eq("user_id", id).maybeSingle();
      if (!data) {
        const name = session.user.user_metadata.full_name || session.user.email?.split("@")[0] || "Runner";
        await supabase.from("profiles").insert({ user_id: id, display_name: name, avatar_initials: name.slice(0,2).toUpperCase(), handle: name.toLowerCase().replace(/\s/g, "") });
        await supabase.from("user_settings").insert({ user_id: id }).then(()=>{}, ()=>{});
        ({ data } = await supabase.from("profiles").select("*").eq("user_id", id).maybeSingle());
      }
      setProfile(data as AppProfile);
      const today = new Date().toISOString().slice(0,10);
      const { data: existing } = await supabase.from("daily_checkins").select("id").eq("user_id", id).eq("checkin_on", today).maybeSingle();
      if (!existing) {
        await supabase.from("daily_checkins").insert({ user_id: id, checkin_on: today, xp_awarded: 10 });
        const last = data?.last_active_on as string | null;
        let streak = data?.streak_days || 0;
        const yest = new Date(Date.now() - 86400000).toISOString().slice(0,10);
        if (!last) streak = 1;
        else if (last === today) {} 
        else if (last === yest) streak += 1;
        else streak = 1;
        await supabase.from("profiles").update({ xp: (data?.xp || 0) + 10, last_active_on: today, streak_days: streak }).eq("user_id", id);
      }
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", id).is("read_at", null);
      setUnread(count || 0);
    })();

    const ch = supabase.channel(`notif:${session.user.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, (payload: any) => {
      setUnread((u) => u + 1);
      toast(payload.new.title, { description: payload.new.body || undefined });
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session]);

  if (loading) return <div className="grid min-h-screen place-items-center font-mono-tech text-xs uppercase tracking-widest">Loading…</div>;
  if (!session) return null;

  const navItems = [
    { to: "/app", label: "Progress", icon: Activity, end: true },
    { to: "/app/trails", label: "Run", icon: MapIcon },
    { to: "/app/communities", label: "Communities", icon: Users },
    { to: "/app/leaderboards", label: "Leaderboards", icon: Trophy },
    { to: "/app/settings", label: "Settings", icon: Settings },
  ];

  return (
    <SettingsProvider userId={session.user.id}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 md:px-6">
            <Link to="/app" className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-4 w-4" /></div><span className="font-semibold tracking-tight">Run Club</span></Link>
            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({isActive})=>cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                  <n.icon className="h-4 w-4" /> {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <NavLink to="/app/notifications" className={({isActive})=>cn("relative grid h-9 w-9 place-items-center rounded-lg transition", isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                <Bell className="h-4 w-4" />
                {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">{unread}</span>}
              </NavLink>
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs sm:flex"><Flame className="h-3 w-3 text-accent" /><span className="font-mono-tech">{profile?.xp ?? 0} XP</span><span className="text-muted-foreground">·</span><span className="font-mono-tech">{profile?.streak_days ?? 0}d</span></div>
              <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{profile?.avatar_initials || "RC"}</AvatarFallback></Avatar>
              <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
          <nav className="flex justify-around border-t border-border md:hidden">
            {navItems.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({isActive})=>cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", isActive ? "text-foreground" : "text-muted-foreground")}>
                <n.icon className="h-4 w-4" /> {n.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <Outlet context={{ session, profile, refreshProfile, unread, refreshUnread: async () => {
          const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.user.id).is("read_at", null);
          setUnread(count || 0);
        } }} />
      </div>
    </SettingsProvider>
  );
}
