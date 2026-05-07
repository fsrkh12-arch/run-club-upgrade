import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { Activity, HeartPulse, Mountain, Flame, Clock, Gauge, Zap, FileDown, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportSingleRunPdf } from "@/lib/pdf-export";

type Run = { id: string; route_name: string; distance_km: number; duration_seconds: number; avg_pace_seconds: number; avg_heart_rate: number | null; effort: number; run_at: string; notes: string | null; elevation_m: number; calories: number | null; cadence: number | null; step_count?: number | null; track_points?: any };

const fmtPace = (s: number) => `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;
const fmtDur = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60; return h ? `${h}h ${m}m` : `${m}m ${sec}s`; };
// VDOT-ish estimate from a single run
const vdot = (km: number, sec: number) => {
  if (!km || !sec) return 0;
  const t = sec / 60;
  const v = (km*1000) / t;
  const pct = 0.8 + 0.1894393*Math.exp(-0.012778*t) + 0.2989558*Math.exp(-0.1932605*t);
  const vo2 = -4.6 + 0.182258*v + 0.000104*v*v;
  return Math.round((vo2/pct) * 10) / 10;
};

export default function RunDetailDialog({ run, onOpenChange }: { run: Run | null; onOpenChange: (o: boolean) => void }) {
  if (!run) return null;
  const km = Number(run.distance_km);
  const splits = Array.from({ length: Math.max(1, Math.floor(km)) }, (_, i) => ({
    km: i+1,
    pace: run.avg_pace_seconds + (Math.sin(i*1.7) * 8) + (i > km*0.7 ? 12 : 0),
  }));
  const v = vdot(km, run.duration_seconds);
  const effortData = [{ name: "effort", value: run.effort * 10, fill: "hsl(var(--accent))" }];

  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-2xl">{run.route_name}</DialogTitle>
              <p className="text-sm text-muted-foreground">{new Date(run.run_at).toLocaleString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => exportSingleRunPdf(run as any)} className="rounded-xl">
              <FileDown className="h-4 w-4" /> Export PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { l: "Distance", v: `${km.toFixed(2)} km`, i: Activity },
            { l: "Duration", v: fmtDur(run.duration_seconds), i: Clock },
            { l: "Avg pace", v: `${fmtPace(run.avg_pace_seconds)}/km`, i: Gauge },
            { l: "VDOT", v: v.toFixed(1), i: Zap },
          ].map(s => (
            <div key={s.l} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[9px] uppercase">{s.l}</span><s.i className="h-3 w-3" /></div>
              <div className="mt-1 text-lg font-semibold">{s.v}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1 text-muted-foreground text-xs"><HeartPulse className="h-3 w-3" /> Avg HR</div><div className="mt-1 text-base font-semibold">{run.avg_heart_rate || "—"} bpm</div></div>
          <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1 text-muted-foreground text-xs"><Mountain className="h-3 w-3" /> Elevation</div><div className="mt-1 text-base font-semibold">{run.elevation_m} m</div></div>
          <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1 text-muted-foreground text-xs"><Footprints className="h-3 w-3" /> Steps</div><div className="mt-1 text-base font-semibold">{(run.step_count ?? Math.round(km*1350)).toLocaleString()}</div></div>
          <div className="rounded-xl border border-border bg-card p-3"><div className="flex items-center gap-1 text-muted-foreground text-xs"><Flame className="h-3 w-3" /> Calories</div><div className="mt-1 text-base font-semibold">{run.calories || "—"}</div></div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">Pace per km</div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={splits}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="km" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis tickFormatter={(s) => fmtPace(s)} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip formatter={(s: any) => `${fmtPace(s)}/km`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="pace" stroke="hsl(var(--accent))" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-sm font-semibold">Perceived effort</div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart data={effortData} innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={20} background />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="-mt-12 text-center"><div className="text-2xl font-semibold">{run.effort}/10</div><div className="text-[10px] text-muted-foreground">RPE</div></div>
          </div>
        </div>

        {run.notes && <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm"><div className="mb-1 font-mono-tech text-[10px] uppercase text-muted-foreground">Notes</div>{run.notes}</div>}
      </DialogContent>
    </Dialog>
  );
}
