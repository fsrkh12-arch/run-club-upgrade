import { useEffect, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Trophy, MessageCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings-context";

type N = { id: string; type: string; title: string; body: string | null; community_id: string | null; read_at: string | null; created_at: string };

export default function NotificationsPage() {
  const { session } = useOutletContext<any>();
  const { t } = useSettings();
  const [list, setList] = useState<N[]>([]);

  const load = async () => {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(100);
    setList((data || []) as N[]);
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.user.id).is("read_at", null);
    load();
  };
  const remove = async (id: string) => { await supabase.from("notifications").delete().eq("id", id); load(); };
  const markOne = async (id: string) => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id); load(); };

  const unread = list.filter(n => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Bell className="h-5 w-5" /> {t("notifications")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : t("no_notifs")}</p>
        </div>
        {unread > 0 && <Button variant="outline" onClick={markAll}><Check className="h-4 w-4" /> {t("mark_all")}</Button>}
      </div>
      <div className="space-y-2">
        <AnimatePresence>
        {list.map((n) => {
          const Icon = n.type === "goal" ? Trophy : n.type === "community_message" ? MessageCircle : Bell;
          const body = (
            <motion.div key={n.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${n.read_at ? "border-border bg-card" : "border-accent/40 bg-accent/5"}`}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted"><Icon className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{n.title}</div>
                {n.body && <div className="mt-0.5 text-sm text-muted-foreground">{n.body}</div>}
                <div className="mt-1 font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">{new Date(n.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-1">
                {!n.read_at && <Button size="icon" variant="ghost" onClick={() => markOne(n.id)}><Check className="h-4 w-4" /></Button>}
                <Button size="icon" variant="ghost" onClick={() => remove(n.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </motion.div>
          );
          return n.community_id ? <Link key={n.id} to="/app/communities" onClick={() => markOne(n.id)}>{body}</Link> : body;
        })}
        </AnimatePresence>
        {list.length === 0 && <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">No notifications yet. Hit a goal or join a community to start receiving them.</div>}
      </div>
    </div>
  );
}
