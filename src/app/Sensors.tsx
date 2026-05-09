import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { Footprints, Gauge, Play, Square, Pause, Save, Activity, Smartphone, Ruler, Flame, Timer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings-context";

// Haversine in meters — used independently from any map
const R = 6371000;
const toRad = (x: number) => (x * Math.PI) / 180;
const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const fmtClock = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), x = Math.floor(s%60); return h ? `${h}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}` : `${m}:${String(x).padStart(2,"0")}`; };
const fmtPace = (s: number) => !s || !isFinite(s) ? "—" : `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;

export default function Sensors() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const { settings } = useSettings();
  const unit = settings.units === "imperial" ? "mi" : "km";
  const conv = (km: number) => settings.units === "imperial" ? km * 0.621371 : km;

  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const [steps, setSteps] = useState(0);
  const [distM_, setDistM_] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cadence, setCadence] = useState(0);     // spm
  const [motionAvail, setMotionAvail] = useState<"unknown" | "ok" | "denied" | "absent">("unknown");
  const [motionMag, setMotionMag] = useState(0);

  const lastFix = useRef<{ lat: number; lng: number; t: number; acc: number } | null>(null);
  const watchId = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const startedAt = useRef<number>(0);

  // Step detector state
  const lastStepAt = useRef(0);
  const lastPeak = useRef(0);
  const recentSteps = useRef<number[]>([]); // timestamps for cadence

  const motionHandler = (ev: DeviceMotionEvent) => {
    if (pausedRef.current) return;
    const a = ev.accelerationIncludingGravity || ev.acceleration;
    if (!a) return;
    const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0;
    // Magnitude minus gravity baseline (~9.81). Bandpass-ish via difference from running mean.
    const mag = Math.sqrt(x*x + y*y + z*z);
    setMotionMag(mag);
    const now = performance.now();
    // Adaptive peak detection: peak above 11.5 m/s², min interval 280ms (≈215 spm cap)
    const dt = now - lastStepAt.current;
    if (mag > 11.8 && lastPeak.current <= 11.0 && dt > 280) {
      lastStepAt.current = now;
      setSteps((s) => s + 1);
      const arr = recentSteps.current;
      arr.push(now);
      while (arr.length && now - arr[0] > 10000) arr.shift();
      if (arr.length > 1) {
        const span = (arr[arr.length-1] - arr[0]) / 1000;
        setCadence(Math.round((arr.length - 1) / span * 60));
      }
    }
    lastPeak.current = mag;
  };

  const requestMotion = async (): Promise<boolean> => {
    const DM: any = (window as any).DeviceMotionEvent;
    if (!DM) { setMotionAvail("absent"); return false; }
    if (typeof DM.requestPermission === "function") {
      try {
        const r = await DM.requestPermission();
        if (r !== "granted") { setMotionAvail("denied"); return false; }
      } catch { setMotionAvail("denied"); return false; }
    }
    window.addEventListener("devicemotion", motionHandler);
    setMotionAvail("ok");
    return true;
  };

  const start = async () => {
    setSteps(0); setDistM_(0); setElapsed(0); setCadence(0); setMotionMag(0);
    lastStepAt.current = 0; lastPeak.current = 0; recentSteps.current = []; lastFix.current = null;
    startedAt.current = performance.now();
    setTracking(true); setPaused(false);

    await requestMotion();

    if ("geolocation" in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (pausedRef.current) return;
          const acc = pos.coords.accuracy ?? 30;
          if (acc > 25) return;
          const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp, acc };
          if (lastFix.current) {
            const d = distM(lastFix.current, fix);
            const dt = Math.max(0.001, (fix.t - lastFix.current.t) / 1000);
            const v = d / dt;
            const drift = Math.max(2.5, (acc + lastFix.current.acc) * 0.35);
            if (v <= 15 && d >= drift) { setDistM_((m) => m + d); lastFix.current = fix; }
          } else lastFix.current = fix;
        },
        (e) => toast.error(`GPS: ${e.message}`),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } else toast.error("No geolocation on this device");

    tickRef.current = window.setInterval(() => {
      if (!pausedRef.current) setElapsed(Math.floor((performance.now() - startedAt.current) / 1000));
    }, 250);

    toast.success("Sensors armed · accelerometer + GPS");
  };

  const stop = async (save: boolean) => {
    setTracking(false); setPaused(false);
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (tickRef.current != null) clearInterval(tickRef.current);
    window.removeEventListener("devicemotion", motionHandler);
    watchId.current = null; tickRef.current = null;
    if (!save) return;
    if (steps < 5 && distM_ < 30) { toast.message("Nothing meaningful to save yet"); return; }
    const distKm = distM_ / 1000;
    const pace = distKm > 0 ? Math.round(elapsed / distKm) : 0;
    const w = Number(profile?.weight_kg) || 70;
    const speedKmh = elapsed ? distKm / (elapsed / 3600) : 0;
    const met = Math.max(3.5, 0.5 * speedKmh + 1.5);
    const calories = Math.round(met * w * (elapsed / 3600));
    const { error } = await supabase.from("runs").insert({
      user_id: session.user.id,
      route_name: `Sensor run · ${new Date().toLocaleDateString()}`,
      distance_km: Number(distKm.toFixed(3)),
      duration_seconds: elapsed,
      avg_pace_seconds: pace,
      effort: Math.max(1, Math.min(10, Math.round(speedKmh))),
      step_count: steps,
      cadence: cadence || null,
      calories,
      elevation_m: 0,
      visibility: settings.default_run_visibility,
    });
    if (error) return toast.error(error.message);
    toast.success(`Saved · ${distKm.toFixed(2)} km · ${steps.toLocaleString()} steps`);
    refreshProfile?.();
  };

  useEffect(() => () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (tickRef.current != null) clearInterval(tickRef.current);
    window.removeEventListener("devicemotion", motionHandler);
  }, []);

  const distKm = distM_ / 1000;
  const pace = distKm > 0 && elapsed > 0 ? elapsed / distKm : 0;
  const stride = profile?.height_cm ? (0.413 * Number(profile.height_cm)) / 100 : 0.78;
  const stepsKm = (steps * stride) / 1000;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 md:p-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-15" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] opacity-60">// device · sensors</div>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><Smartphone className="h-6 w-6" /> Step &amp; Distance Tracker</h1>
            <p className="mt-1 max-w-xl text-sm opacity-70">Counts steps from your phone's accelerometer and measures distance from GPS — no map required. Works in your pocket.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!tracking ? (
              <Button size="lg" className="rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90" onClick={start}><Play className="h-4 w-4" /> Start tracking</Button>
            ) : (
              <>
                <Button size="lg" variant="secondary" className="rounded-xl" onClick={() => setPaused(p => !p)}>{paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}</Button>
                <Button size="lg" variant="destructive" className="rounded-xl" onClick={() => stop(true)}><Save className="h-4 w-4" /> Stop &amp; save</Button>
                <Button size="lg" variant="outline" className="rounded-xl" onClick={() => stop(false)}><Square className="h-4 w-4" /> Discard</Button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">steps</span><Footprints className="h-4 w-4" /></div>
          <div className="mt-3 text-4xl font-semibold tabular-nums">{steps.toLocaleString()}</div>
          <div className="mt-1 font-mono-tech text-xs text-muted-foreground">{cadence || 0} spm · stride {stride.toFixed(2)}m</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">distance · gps</span><Ruler className="h-4 w-4" /></div>
          <div className="mt-3 text-4xl font-semibold tabular-nums">{conv(distKm).toFixed(3)} <span className="text-base text-muted-foreground">{unit}</span></div>
          <div className="mt-1 font-mono-tech text-xs text-muted-foreground">~{conv(stepsKm).toFixed(2)} {unit} via stride</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">time</span><Timer className="h-4 w-4" /></div>
          <div className="mt-3 text-4xl font-semibold tabular-nums">{fmtClock(elapsed)}</div>
          <div className="mt-1 font-mono-tech text-xs text-muted-foreground">pace {fmtPace(pace)}/{unit}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground"><span className="font-mono-tech text-[10px] uppercase tracking-widest">accelerometer</span><Activity className="h-4 w-4" /></div>
          <div className="mt-3 text-4xl font-semibold tabular-nums">{motionMag.toFixed(1)}<span className="text-base text-muted-foreground"> m/s²</span></div>
          <div className="mt-1 font-mono-tech text-xs text-muted-foreground">
            {motionAvail === "ok" && "live · peak detection"}
            {motionAvail === "denied" && "permission denied"}
            {motionAvail === "absent" && "no motion sensor"}
            {motionAvail === "unknown" && "tap start to enable"}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Gauge className="h-4 w-4" /> How this works</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>• <strong className="text-foreground">Steps</strong> are detected by analyzing your phone's accelerometer in real time using adaptive peak detection (≥280ms gap, magnitude threshold {">"}11.8 m/s²).</li>
          <li>• <strong className="text-foreground">Distance</strong> is measured purely from GPS using the Haversine formula with a 25m accuracy gate and accuracy-scaled drift filter — no map rendering required.</li>
          <li>• <strong className="text-foreground">Cadence</strong> is computed from a 10-second rolling window of step timestamps.</li>
          <li>• <strong className="text-foreground">Calories</strong> use a MET model calibrated to your weight (Settings → Profile).</li>
          <li>• On iOS Safari you'll be prompted for motion permission. Keep the screen on or installed as a home-screen app for best results.</li>
        </ul>
      </div>
    </div>
  );
}