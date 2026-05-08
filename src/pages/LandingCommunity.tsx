import { motion } from "framer-motion";
import LandingShell from "./_landing-shell";

const clubs = [
  { e: "🌅", n: "Baku Dawn Patrol", m: "248 members · active now", c: "5 sunrise runs scheduled this week" },
  { e: "🏔️", n: "Trail Collective", m: "1,247 members", c: "Weekend ridge run — 12K elevation gain" },
  { e: "🥇", n: "Marathon Makers", m: "892 members", c: "16-week Berlin block starts Monday" },
  { e: "🌱", n: "5K Starters", m: "412 members", c: "Welcome thread: 18 new runners this week" },
  { e: "🌙", n: "Night Owls", m: "612 members", c: "Reflective gear giveaway running now" },
  { e: "⚡", n: "Speed Lab", m: "388 members", c: "Tuesday track session — 8×400m" },
];

export default function LandingCommunity() {
  return (
    <LandingShell eyebrow="Community" title="Find your people. Run with them.">
      <section className="mx-auto max-w-7xl px-6 py-20">
        <p className="max-w-2xl text-lg text-muted-foreground">Join sub-communities by city, pace or vibe. Real-time chat, per-club leaderboards, side quests and meetups — all in one place.</p>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c, i) => (
            <motion.div key={c.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i*0.05 }} className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-muted text-2xl">{c.e}</div>
              <div className="flex-1"><div className="font-semibold">{c.n}</div><div className="text-xs text-muted-foreground">{c.m}</div><div className="mt-1 text-sm">{c.c}</div></div>
            </motion.div>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}