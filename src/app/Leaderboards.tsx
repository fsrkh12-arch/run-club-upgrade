import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Globe, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type Row = { user_id: string; display_name: string; avatar_initials: string; xp: number; streak_days: number; city: string };

export default function Leaderboards() {
  const { session, profile } = useOutletContext<any>();
  const [rows, setRows] = useState<Row[]>([]);
  const [communities, setCommunities] = useState<{ id: string; name: string; emoji: string }[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, string[]>>({});
  const [tab, setTab] = useState<string>("global");

  useEffect(() => {
    (async () => {
      const [p, c, m] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, avatar_initials, xp, streak_days, city").order("xp", { ascending: false }).limit(200),
        supabase.from("communities").select("id, name, emoji"),
        supabase.from("community_members").select("community_id, user_id"),
      ]);
      setRows((p.data || []) as Row[]);
      const myCommIds = new Set((m.data || []).filter((x: any) => x.user_id === session.user.id).map((x: any) => x.community_id));
      setCommunities(((c.data || []) as any[]).filter(c => myCommIds.has(c.id)));
      const map: Record<string, string[]> = {};
      (m.data || []).forEach((x: any) => { (map[x.community_id] ||= []).push(x.user_id); });
      setMemberMap(map);
    })();
  }, [session]);

  const filtered = useMemo(() => {
    if (tab === "global") return rows;
    const ids = new Set(memberMap[tab] || []);
    return rows.filter(r => ids.has(r.user_id));
  }, [tab, rows, memberMap]);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground md:p-8">
        <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">Leaderboards</div>
        <h1 className="mt-1 text-3xl font-semibold md:text-4xl">Climb the ranks</h1>
        <p className="mt-2 text-sm opacity-70">Earn XP from runs, daily check-ins and challenges. Compete globally or just within your crews.</p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        <button onClick={()=>setTab("global")} className={cn("flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition", tab==="global" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><Globe className="h-3.5 w-3.5" /> Global</button>
        {communities.map((c) => (
          <button key={c.id} onClick={()=>setTab(c.id)} className={cn("flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm transition", tab===c.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            <span>{c.emoji}</span> {c.name}
          </button>
        ))}
        {communities.length === 0 && <div className="rounded-full border border-dashed border-border px-4 py-2 text-xs text-muted-foreground"><Users className="mr-1 inline h-3 w-3" /> Join communities to unlock crew leaderboards</div>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.map((r, i) => {
          const me = r.user_id === session.user.id;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <motion.div key={r.user_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.02 }} className={cn("flex items-center gap-4 border-b border-border p-4 last:border-b-0", me && "bg-accent/10")}>
              <div className="w-8 text-center font-mono-tech text-sm">{medal || `#${i+1}`}</div>
              <Avatar className="h-10 w-10"><AvatarFallback className={cn("text-xs", me && "bg-primary text-primary-foreground")}>{r.avatar_initials}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="truncate font-semibold">{r.display_name} {me && <span className="ml-1 rounded bg-primary px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary-foreground">you</span>}</div>
                <div className="text-xs text-muted-foreground">{r.city} · {r.streak_days}d streak</div>
              </div>
              <div className="text-right"><div className="font-mono-tech text-lg font-semibold">{r.xp.toLocaleString()}</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">XP</div></div>
            </motion.div>
          );
        })}
        {filtered.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground"><Trophy className="mx-auto mb-2 h-8 w-8 opacity-30" />No runners here yet.</div>}
      </div>
    </div>
  );
}
