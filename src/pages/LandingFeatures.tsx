import { motion } from "framer-motion";
import { Activity, BarChart3, Users, Trophy, Shield, Heart, Map, MessageCircle, Gauge, Zap, Footprints, Mountain } from "lucide-react";
import LandingShell from "./_landing-shell";

const features = [
  { icon: Activity, title: "Sub-second GPS tracking", body: "True high-accuracy geolocation with drift filters and outlier rejection. Distance and pace verified by Haversine math." },
  { icon: BarChart3, title: "Deep analytics", body: "VDOT, training load, weekly periodization charts and AI-powered form insights." },
  { icon: Gauge, title: "Live HUD", body: "On-map distance, pace, speed, elevation gain and step count, updating every fix." },
  { icon: Trophy, title: "XP, streaks & quests", body: "Daily side quests, streak multipliers up to ×1.7 and a level curve that stays meaningful." },
  { icon: Mountain, title: "Elevation & cadence", body: "Barometric-grade elevation gain plus stride-derived cadence tailored to your height." },
  { icon: Footprints, title: "Step formulas", body: "Stride length from anthropometrics (0.413 × height) for accurate per-run step counts." },
  { icon: Heart, title: "Health-first", body: "Recovery scores, HRV trends, calories via MET formula calibrated to your weight." },
  { icon: Shield, title: "You own your data", body: "Granular privacy. Make every run public, friends-only, or strictly private." },
  { icon: MessageCircle, title: "Realtime chat", body: "Community channels with mute controls, instant notifications and message search." },
];

export default function LandingFeatures() {
  return (
    <LandingShell eyebrow="Why us" title="Everything a runner needs. Nothing they don't.">
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i*0.04 }} whileHover={{ y: -4 }} className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg">
              <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-110"><f.icon className="h-5 w-5" /></div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}