import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Activity, BarChart3, Users, Trophy, Shield, Sparkles, MessageCircle, Map, Heart, Zap, ChevronRight, Play, Star, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

const fade = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.6, delay } });

const features = [
  { icon: Activity, title: "Smart run tracking", body: "GPS, pace, heart rate, cadence and elevation captured automatically with sub-second precision." },
  { icon: BarChart3, title: "Deep analytics", body: "VDOT, training load, weekly periodization charts and AI-powered form insights." },
  { icon: Users, title: "Real communities", body: "Join clubs by city, pace or vibe. Send messages, plan meetups, run together." },
  { icon: Trophy, title: "Live leaderboards", body: "Compete on the global board or just within your communities. XP, streaks, badges." },
  { icon: Heart, title: "Health-first", body: "Recovery scores, HRV trends, injury risk flags. Train smarter, not just harder." },
  { icon: Shield, title: "You own your data", body: "Granular privacy. Make every run public, friends-only, or strictly private." },
];

const policies = [
  { title: "Privacy by default", body: "Your runs are private until you choose to share. Location data is fuzzed for public posts." },
  { title: "No ads, ever", body: "We don't sell attention. The product is the product." },
  { title: "Open data export", body: "Export every run as GPX/FIT/CSV anytime. Your training history belongs to you." },
  { title: "Safety first", body: "Live location sharing for solo runs, panic button, and verified community moderators." },
];

function PhonePreview() {
  const [tab, setTab] = useState(0);
  useEffect(() => { const t = setInterval(() => setTab((x) => (x + 1) % 3), 3200); return () => clearInterval(t); }, []);
  return (
    <div className="relative mx-auto h-[640px] w-[320px]">
      <div className="absolute -inset-10 rounded-[60px] bg-gradient-to-tr from-accent/30 via-primary/10 to-accent/20 blur-3xl" />
      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8 }} className="relative h-full w-full rounded-[44px] border-[10px] border-primary bg-background shadow-2xl">
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-primary" />
        <div className="flex h-full flex-col overflow-hidden rounded-[34px] bg-gradient-to-b from-background to-muted">
          <div className="flex items-center justify-between px-5 pt-8 font-mono-tech text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>9:41</span><span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Run Club</span>
          </div>
          <div className="flex-1 px-5 pt-4">
            {tab === 0 && (
              <motion.div key="t0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div className="text-[11px] font-mono-tech uppercase tracking-widest text-muted-foreground">Today</div>
                <div className="text-4xl font-semibold">8.42<span className="text-lg text-muted-foreground"> km</span></div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {[["Pace","4:52"],["HR","156"],["Load","82"]].map(([l,v])=> <div key={l} className="rounded-xl border border-border bg-card p-3"><div className="font-mono-tech text-[9px] uppercase text-muted-foreground">{l}</div><div className="text-base font-semibold">{v}</div></div>)}
                </div>
                <div className="mt-4 h-32 rounded-xl bg-primary p-3 text-primary-foreground">
                  <div className="text-[10px] font-mono-tech uppercase tracking-widest opacity-70">Live route</div>
                  <svg viewBox="0 0 200 90" className="mt-1 h-20 w-full"><path d="M5 70 Q 40 10 80 50 T 160 30 L 195 60" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
                </div>
                <Button className="w-full rounded-xl"><Play className="h-4 w-4" /> Start run</Button>
              </motion.div>
            )}
            {tab === 1 && (
              <motion.div key="t1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div className="text-[11px] font-mono-tech uppercase tracking-widest text-muted-foreground">Communities</div>
                {[["🌅","Baku Dawn Patrol","248 members"],["🏔️","Trail Collective","1.2k members"],["🌙","Night Owls","612 members"]].map(([e,n,m])=> (
                  <div key={n} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-lg">{e}</div>
                    <div className="flex-1"><div className="text-sm font-semibold">{n}</div><div className="text-[10px] text-muted-foreground">{m}</div></div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </motion.div>
            )}
            {tab === 2 && (
              <motion.div key="t2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div className="text-[11px] font-mono-tech uppercase tracking-widest text-muted-foreground">Leaderboard</div>
                {[["1","Leyla M.","2,840"],["2","Rashad A.","2,612"],["3","You","2,508"],["4","Nigar K.","2,401"]].map(([r,n,xp])=> (
                  <div key={n} className={"flex items-center gap-3 rounded-xl border p-3 "+(n==="You"?"border-primary bg-primary text-primary-foreground":"border-border bg-card")}>
                    <div className="font-mono-tech text-xs w-5">{r}</div>
                    <div className="flex-1 text-sm font-semibold">{n}</div>
                    <div className="font-mono-tech text-xs">{xp} XP</div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
          <div className="m-4 flex justify-around rounded-2xl border border-border bg-card p-2">
            {[Activity, Users, Trophy].map((I, i) => <button key={i} onClick={() => setTab(i)} className={"grid h-10 w-10 place-items-center rounded-xl "+(tab===i?"bg-primary text-primary-foreground":"text-muted-foreground")}><I className="h-4 w-4" /></button>)}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function Landing() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-4 w-4" /></div><span className="font-semibold tracking-tight">Run Club</span></div>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <a href="#mission" className="text-muted-foreground hover:text-foreground">Mission</a>
            <Link to="/features" className="text-muted-foreground hover:text-foreground">Features</Link>
            <Link to="/community" className="text-muted-foreground hover:text-foreground">Community</Link>
            <Link to="/policies" className="text-muted-foreground hover:text-foreground">Policies</Link>
            <Link to="/download" className="text-muted-foreground hover:text-foreground">Download</Link>
          </nav>
          <div className="flex items-center gap-2"><Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link><Link to="/auth"><Button size="sm">Get started</Button></Link></div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--accent)/0.15),transparent_60%),radial-gradient(circle_at_80%_60%,hsl(var(--primary)/0.08),transparent_60%)]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:64px_64px] opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_.9fr] lg:py-28">
          <motion.div {...fade(0)} className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-mono-tech uppercase tracking-widest text-muted-foreground"><Sparkles className="h-3 w-3" /> v2.0 · Now with communities</div>
            <h1 className="text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">Run further.<br/><span className="text-muted-foreground">Together.</span></h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">The training app built around real running clubs. Track every kilometer, analyze your form, and connect with runners who actually show up.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth"><Button size="lg" className="rounded-xl">Start training free <ChevronRight className="h-4 w-4" /></Button></Link>
              <a href="#download"><Button size="lg" variant="outline" className="rounded-xl">Get the app</Button></a>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex"><div className="grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-semibold">LM</div><div className="-ml-2 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-primary text-[10px] font-semibold text-primary-foreground">RA</div><div className="-ml-2 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-accent text-[10px] font-semibold">NK</div></div>
              <div>12,400+ runners · <span className="inline-flex items-center gap-1">{[...Array(5)].map((_,i)=><Star key={i} className="h-3 w-3 fill-current" />)}</span> 4.9</div>
            </div>
          </motion.div>
          <motion.div {...fade(0.2)} className="flex justify-center"><PhonePreview /></motion.div>
        </div>
      </section>

      {/* MISSION */}
      <section id="mission" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <motion.div {...fade(0)} className="grid gap-12 lg:grid-cols-2">
            <div>
              <div className="font-mono-tech text-xs uppercase tracking-widest text-muted-foreground">Our mission</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Make running a team sport again.</h2>
            </div>
            <p className="text-lg text-muted-foreground lg:pt-10">Solo apps got us tracking. Now we want to get you connected. Run Club is built for the people who run together — clubs, crews, training partners — with the analytics serious athletes demand and the social tools to keep showing up.</p>
          </motion.div>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[["12.4K","active runners"],["847","communities"],["2.1M","kilometers logged"]].map(([n, l], i) => (
              <motion.div key={l} {...fade(i*0.1)} className="rounded-2xl border border-border bg-card p-8">
                <div className="text-5xl font-semibold tracking-tight">{n}</div>
                <div className="mt-2 font-mono-tech text-xs uppercase tracking-widest text-muted-foreground">{l}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <motion.div {...fade(0)} className="max-w-2xl">
            <div className="font-mono-tech text-xs uppercase tracking-widest text-muted-foreground">Why us</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Everything a runner needs. Nothing they don't.</h2>
          </motion.div>
          <div className="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div key={f.title} {...fade(i*0.05)} whileHover={{ y: -4 }} className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg">
                <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-110"><f.icon className="h-5 w-5" /></div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* COMMUNITY */}
      <section id="community" className="border-b border-border">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2">
          <motion.div {...fade(0)}>
            <div className="font-mono-tech text-xs uppercase tracking-widest text-muted-foreground">Community</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Find your people. Run with them.</h2>
            <p className="mt-6 text-lg text-muted-foreground">Join sub-communities by city, pace, distance, or trail style. Chat in real time, plan meetups, and compete on a leaderboard that's only your crew.</p>
            <div className="mt-8 space-y-3">
              {[[MessageCircle,"Real-time group chat"],[Trophy,"Per-community leaderboards"],[Map,"Plan meetups & shared routes"],[Gauge,"XP from runs + daily streaks"]].map(([I, t]: any) => (
                <div key={t} className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card"><I className="h-4 w-4" /></div><span className="font-medium">{t}</span></div>
              ))}
            </div>
          </motion.div>
          <motion.div {...fade(0.2)} className="space-y-3">
            {[
              { e: "🌅", n: "Baku Dawn Patrol", m: "248 members · active now", c: "5 sunrise runs scheduled this week" },
              { e: "🏔️", n: "Trail Collective", m: "1,247 members", c: "Weekend ridge run — 12K elevation gain" },
              { e: "🥇", n: "Marathon Makers", m: "892 members", c: "16-week Berlin block starts Monday" },
              { e: "🌱", n: "5K Starters", m: "412 members", c: "Welcome thread: 18 new runners this week" },
            ].map((c, i) => (
              <motion.div key={c.n} initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i*0.08 }} whileHover={{ x: -4 }} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-muted text-2xl">{c.e}</div>
                <div className="flex-1"><div className="font-semibold">{c.n}</div><div className="text-xs text-muted-foreground">{c.m}</div><div className="mt-1 text-sm">{c.c}</div></div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* POLICIES */}
      <section id="policies" className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <motion.div {...fade(0)} className="max-w-2xl">
            <div className="font-mono-tech text-xs uppercase tracking-widest opacity-60">Our policies</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Promises we put in writing.</h2>
          </motion.div>
          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-primary-foreground/10 md:grid-cols-2">
            {policies.map((p, i) => (
              <motion.div key={p.title} {...fade(i*0.08)} className="bg-primary p-8">
                <Shield className="mb-4 h-5 w-5" />
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm opacity-70">{p.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* DOWNLOAD */}
      <section id="download" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 py-24 text-center">
          <motion.div {...fade(0)}>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Start your first run.</h2>
            <p className="mt-4 text-lg text-muted-foreground">Free forever. No ads. Your data stays yours.</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link to="/auth"><Button size="lg" className="rounded-xl">Open in browser <ChevronRight className="h-4 w-4" /></Button></Link>
              <Button size="lg" variant="outline" className="rounded-xl"><Apple className="h-4 w-4" /> App Store</Button>
              <Button size="lg" variant="outline" className="rounded-xl"><Play className="h-4 w-4" /> Google Play</Button>
            </div>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"><Zap className="h-3 w-3" /></div><span>Run Club © 2026</span></div>
          <div className="flex gap-6"><a href="#policies">Privacy</a><a href="#policies">Terms</a><a href="#community">Community guidelines</a></div>
        </div>
      </footer>
    </main>
  );
}
