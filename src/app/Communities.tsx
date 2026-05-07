import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Plus, Users, Hash, Search, ArrowLeft, Swords, Check, Lock, Flame, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import SideQuests from "./SideQuests";

type Community = { id: string; slug: string; name: string; description: string | null; emoji: string; city: string | null; is_official: boolean };
type Membership = { community_id: string };
type Message = { id: string; community_id: string; user_id: string; content: string; created_at: string };
type ProfileLite = { user_id: string; display_name: string; avatar_initials: string };

export default function Communities() {
  const { session, profile } = useOutletContext<any>();
  const [view, setView] = useState<"chat" | "quests">("chat");
  const [communities, setCommunities] = useState<Community[]>([]);
  const [memberships, setMemberships] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<Community | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [c, m, p] = await Promise.all([
      supabase.from("communities").select("*").order("is_official", { ascending: false }),
      supabase.from("community_members").select("community_id").eq("user_id", session.user.id),
      supabase.from("profiles").select("user_id, display_name, avatar_initials"),
    ]);
    setCommunities((c.data || []) as Community[]);
    setMemberships(new Set((m.data || []).map((x: any) => x.community_id)));
    setProfiles(Object.fromEntries((p.data || []).map((x: any) => [x.user_id, x])));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!active) return;
    setMessages([]);
    supabase.from("community_messages").select("*").eq("community_id", active.id).order("created_at", { ascending: true }).limit(200).then(({ data }) => setMessages((data || []) as Message[]));
    const ch = supabase.channel(`msgs:${active.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "community_messages", filter: `community_id=eq.${active.id}` }, (payload) => {
      setMessages((prev) => [...prev, payload.new as Message]);
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active]);

  useEffect(() => { scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const join = async (c: Community) => {
    const { error } = await supabase.from("community_members").insert({ community_id: c.id, user_id: session.user.id });
    if (error) return toast.error(error.message);
    toast.success(`Joined ${c.name}`); load();
  };
  const leave = async (c: Community) => {
    await supabase.from("community_members").delete().eq("community_id", c.id).eq("user_id", session.user.id);
    if (active?.id === c.id) setActive(null);
    load();
  };

  const send = async () => {
    if (!active || !text.trim()) return;
    const { error } = await supabase.from("community_messages").insert({ community_id: active.id, user_id: session.user.id, content: text.trim() });
    if (error) return toast.error(error.message);
    setText("");
  };

  const create = async () => {
    if (newName.trim().length < 3) return toast.error("Name too short");
    const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + Math.random().toString(36).slice(2,6);
    const { data, error } = await supabase.from("communities").insert({ slug, name: newName, description: newDesc || null, emoji: "🏃", created_by: session.user.id }).select().single();
    if (error) return toast.error(error.message);
    await supabase.from("community_members").insert({ community_id: data.id, user_id: session.user.id, role: "owner" });
    toast.success("Community created");
    setCreating(false); setNewName(""); setNewDesc(""); load();
  };

  const filtered = communities.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
  const myList = filtered.filter((c) => memberships.has(c.id));
  const discoverList = filtered.filter((c) => !memberships.has(c.id));

  return (
    <div className="mx-auto max-w-[1500px] p-4 md:p-6">
      <div className="mb-4">
        <Tabs value={view} onValueChange={(v)=>setView(v as any)}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="chat"><Users className="mr-1 h-3.5 w-3.5" /> Crews</TabsTrigger>
            <TabsTrigger value="quests"><Swords className="mr-1 h-3.5 w-3.5" /> Side Quests</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {view === "quests" ? <SideQuests session={session} /> : (
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className={cn("space-y-4", active && "hidden lg:block")}>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Communities</h2><Button size="sm" variant="outline" onClick={()=>setCreating(true)}><Plus className="h-4 w-4" /></Button></div>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search" value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
          </div>
          {creating && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Input placeholder="Community name" value={newName} onChange={(e)=>setNewName(e.target.value)} />
              <Textarea placeholder="Description" value={newDesc} onChange={(e)=>setNewDesc(e.target.value)} />
              <div className="flex gap-2"><Button onClick={create} className="flex-1">Create</Button><Button variant="outline" onClick={()=>setCreating(false)}>Cancel</Button></div>
            </motion.div>
          )}

          {myList.length > 0 && <div>
            <div className="mb-2 px-2 font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">Your crews</div>
            <div className="space-y-1">{myList.map((c) => <CommunityCard key={c.id} c={c} active={active?.id===c.id} onClick={()=>setActive(c)} joined />)}</div>
          </div>}

          <div>
            <div className="mb-2 px-2 font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">Discover</div>
            <div className="space-y-1">{discoverList.map((c) => <CommunityCard key={c.id} c={c} onClick={()=>join(c)} />)}</div>
          </div>
        </aside>

        <main className={cn("rounded-2xl border border-border bg-card", !active && "hidden lg:flex lg:items-center lg:justify-center lg:p-20")}>
          {!active ? (
            <div className="text-center text-muted-foreground"><Users className="mx-auto mb-3 h-10 w-10 opacity-40" /><p>Select a community to start chatting</p></div>
          ) : (
            <div className="flex h-[calc(100vh-9rem)] flex-col">
              <header className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-3">
                  <button className="lg:hidden" onClick={()=>setActive(null)}><ArrowLeft className="h-5 w-5" /></button>
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-xl">{active.emoji}</div>
                  <div><h2 className="font-semibold">{active.name}</h2><p className="text-xs text-muted-foreground">{active.description || "Community chat"}</p></div>
                </div>
                {memberships.has(active.id) ? <Button size="sm" variant="ghost" onClick={()=>leave(active)}>Leave</Button> : <Button size="sm" onClick={()=>join(active)}>Join</Button>}
              </header>
              <div ref={scrollerRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                <AnimatePresence initial={false}>
                {messages.map((m) => {
                  const mine = m.user_id === session.user.id;
                  const author = profiles[m.user_id];
                  return (
                    <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                      <Avatar className="h-7 w-7"><AvatarFallback className="bg-muted text-[10px]">{author?.avatar_initials || "?"}</AvatarFallback></Avatar>
                      <div className={cn("max-w-[75%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {!mine && <div className="text-[10px] font-semibold opacity-70">{author?.display_name || "Runner"}</div>}
                        <div>{m.content}</div>
                      </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
                {messages.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No messages yet. Say hi 👋</div>}
              </div>
              {memberships.has(active.id) ? (
                <div className="flex gap-2 border-t border-border p-3">
                  <Input value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={(e)=>e.key==="Enter" && !e.shiftKey && (e.preventDefault(), send())} placeholder={`Message #${active.slug}`} />
                  <Button onClick={send}><Send className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="border-t border-border p-3 text-center text-sm text-muted-foreground">Join to send messages</div>
              )}
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}

function CommunityCard({ c, active, onClick, joined }: { c: Community; active?: boolean; onClick: () => void; joined?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition hover:border-border hover:bg-muted/50", active && "border-border bg-muted")}>
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-lg">{c.emoji}</div>
      <div className="flex-1 min-w-0"><div className="truncate text-sm font-semibold">{c.name}</div><div className="truncate text-[11px] text-muted-foreground"><Hash className="mr-0.5 inline h-2.5 w-2.5" />{c.slug}</div></div>
      {joined && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-mono-tech text-accent-foreground">in</span>}
    </button>
  );
}
