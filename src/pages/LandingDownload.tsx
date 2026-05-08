import { Apple, Play, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import LandingShell from "./_landing-shell";

export default function LandingDownload() {
  return (
    <LandingShell eyebrow="Download" title="Start your first run today.">
      <section className="mx-auto max-w-7xl px-6 py-20 text-center">
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">Free forever. No ads. Your data stays yours.</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth"><Button size="lg" className="rounded-xl">Open in browser <ChevronRight className="h-4 w-4" /></Button></Link>
          <Button size="lg" variant="outline" className="rounded-xl"><Apple className="h-4 w-4" /> App Store</Button>
          <Button size="lg" variant="outline" className="rounded-xl"><Play className="h-4 w-4" /> Google Play</Button>
        </div>
        <div className="mt-16 grid gap-4 md:grid-cols-3 text-left">
          {[["iOS 16+","Native HealthKit sync, background GPS, Apple Watch companion."],["Android 12+","Wear OS support, foreground GPS service, battery optimized."],["Web","Fully featured PWA — installable, offline-tolerant, real-time sync."]].map(([t,b]) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-6"><div className="font-semibold">{t}</div><p className="mt-2 text-sm text-muted-foreground">{b}</p></div>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}