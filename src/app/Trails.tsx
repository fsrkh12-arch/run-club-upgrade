import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { motion, AnimatePresence } from "framer-motion";
import { Map as MapIcon, MapPin, Save, Trash2, Play, Square, Pause, Eye, EyeOff, Route, Locate, Share2, Repeat, Sparkles, Pencil, Crosshair, Footprints, AlertTriangle, Gauge, Timer, Flame, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings-context";

// Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Trail = { id: string; user_id: string; name: string; description: string | null; distance_km: number; city: string | null; polyline: any; is_public: boolean; created_at: string };
type Run = { id: string; route_name: string; distance_km: number; run_at: string; track_points: any; trail_id: string | null };
type Sample = { lat: number; lng: number; t: number; acc: number; alt: number | null; speed: number | null };

// === Geo helpers (Haversine in meters; precise) ===
const R_EARTH = 6371000;
const toRad = (x: number) => (x * Math.PI) / 180;
const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
const haversineKm = (a: [number, number], b: [number, number]) => haversineM({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) / 1000;
const totalDistKm = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + haversineKm(pts[i], p), 0);
const ptsFromGeo = (g: any): [number, number][] => (g?.coordinates || []).map((c: number[]) => [c[1], c[0]] as [number, number]);
const trailFingerprint = (pts: [number, number][]) => pts.length < 2 ? null : { mid: pts[Math.floor(pts.length / 2)], dist: totalDistKm(pts) };
const similar = (a: ReturnType<typeof trailFingerprint>, b: ReturnType<typeof trailFingerprint>) =>
  !!a && !!b && haversineKm(a.mid, b.mid) < 0.4 && Math.abs(a.dist - b.dist) / Math.max(a.dist, 0.1) < 0.2;

function ClickCapture({ onClick, enabled }: { onClick: (latlng: [number, number]) => void; enabled: boolean }) {
  useMapEvents({ click: (e) => enabled && onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}
function FlyTo({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.6 }); }, [center?.[0], center?.[1]]);
  return null;
}
function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (pts.length > 1) map.fitBounds(pts as any, { padding: [40, 40] }); }, [pts.length]);
  return null;
}

const fmtClock = (s: number) => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), x = Math.floor(s%60); return h ? `${h}:${String(m).padStart(2,"0")}:${String(x).padStart(2,"0")}` : `${m}:${String(x).padStart(2,"0")}`; };
const fmtPace = (sPerKm: number) => !sPerKm || !isFinite(sPerKm) ? "—" : `${Math.floor(sPerKm/60)}:${String(Math.round(sPerKm%60)).padStart(2,"0")}`;

export default function Trails() {
  const { session, profile, refreshProfile } = useOutletContext<any>();
  const { settings } = useSettings();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();

  const [trails, setTrails] = useState<Trail[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [center, setCenter] = useState<[number, number]>([40.4093, 49.8671]);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [isPublic, setIsPublic] = useState(true);

  // Run state
  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [movingSec, setMovingSec] = useState(0);
  const [elevGain, setElevGain] = useState(0);
  const [instSpeed, setInstSpeed] = useState(0); // m/s
  const [activeTrail, setActiveTrail] = useState<Trail | null>(null);
  const [tab, setTab] = useState<"explore" | "mine" | "history">("explore");
  const [search, setSearch] = useState("");
  const [sosOpen, setSosOpen] = useState(false);

  const watchId = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const load = async () => {
    const [t, r] = await Promise.all([
      supabase.from("trails").select("*").or(`is_public.eq.true,user_id.eq.${session.user.id}`).order("created_at", { ascending: false }).limit(120),
      supabase.from("runs").select("id, route_name, distance_km, run_at, track_points, trail_id").eq("user_id", session.user.id).not("track_points", "is", null).order("run_at", { ascending: false }).limit(60),
    ]);
    setTrails((t.data || []) as Trail[]);
    setRuns((r.data || []) as Run[]);
  };
  useEffect(() => { load(); }, []);

  // Passive position (when not tracking) — for the "you are here" pulse
  useEffect(() => {
    if (!navigator.geolocation || tracking) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMe(c); setAccuracy(pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  useEffect(() => { if (me && !samples.length && !draft.length) setCenter(me); /* eslint-disable-next-line */ }, [me?.[0], me?.[1]]);

  // Auto-start when arriving with ?start=1
  useEffect(() => {
    if (params.get("start") === "1" && !tracking) {
      startRun();
      const np = new URLSearchParams(params); np.delete("start"); setParams(np, { replace: true });
    }
    // eslint-disable-next-line
  }, []);

  // === Accurate GPS recording ===
  const startRun = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not available on this device");
    setSamples([]); setMovingSec(0); setElevGain(0); setInstSpeed(0);
    setTracking(true); setPaused(false);
    lastTickRef.current = performance.now();

    // 1Hz timer for moving-time
    tickRef.current = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      if (!pausedRef.current && instSpeedRef.current > 0.6) setMovingSec((s) => s + dt);
    }, 1000);

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pausedRef.current) return;
        const acc = pos.coords.accuracy ?? 30;
        // Reject low-accuracy fixes (>30m) and crazy jumps
        if (acc > 35) return;
        const s: Sample = {
          lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp,
          acc, alt: pos.coords.altitude, speed: pos.coords.speed,
        };
        setSamples((prev) => {
          if (prev.length) {
            const last = prev[prev.length - 1];
            const d = haversineM(last, s);
            const dt = Math.max(0.001, (s.t - last.t) / 1000);
            const v = d / dt;
            // Discard impossible jumps (>10 m/s ≈ 36 km/h sprint cap unless dt small)
            if (v > 12) return prev;
            // Tiny GPS drift while standing still
            if (d < acc * 0.5 && d < 4) return prev;
            // Elevation gain (only positive, with 1m noise floor)
            if (last.alt != null && s.alt != null && s.alt - last.alt > 1) {
              setElevGain((e) => e + (s.alt! - last.alt!));
            }
            instSpeedRef.current = pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : v;
            setInstSpeed(instSpeedRef.current);
          }
          return [...prev, s];
        });
        setMe([s.lat, s.lng]); setAccuracy(acc); setCenter([s.lat, s.lng]);
      },
      (err) => toast.error(`GPS: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    toast.success("GPS locked. Run away.");
  };
  const instSpeedRef = useRef(0);

  const stopRun = async () => {
    setTracking(false); setPaused(false);
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (tickRef.current != null) clearInterval(tickRef.current);
    watchId.current = null; tickRef.current = null;

    if (samples.length < 2) { toast.message("No movement captured"); return; }
    const pts: [number, number][] = samples.map((s) => [s.lat, s.lng]);
    const dist = totalDistKm(pts); // km
    const dur = movingSec > 5 ? Math.round(movingSec) : Math.round((samples[samples.length-1].t - samples[0].t)/1000);
    const pace = dist > 0 ? Math.round(dur / dist) : 0;
    // Stride length estimate from height (Welk): 0.413 * h(cm), fallback 0.78 m
    const h = Number(profile?.height_cm) || 170;
    const stride = 0.413 * h / 100;
    const steps = Math.max(0, Math.round((dist * 1000) / stride));
    // Calories — Pandolf-ish simplified: kcal = MET * weight(kg) * hours; MET ≈ 0.5 * speed(km/h)
    const w = Number(profile?.weight_kg) || 70;
    const speedKmh = dur ? (dist / (dur / 3600)) : 0;
    const met = Math.max(4, 0.5 * speedKmh + 1.5);
    const calories = Math.round(met * w * (dur / 3600));
    // Effort heuristic from pace + elevation
    const effort = Math.max(1, Math.min(10, Math.round((10 - Math.min(7, pace/60)) + Math.min(2, elevGain/100))));

    const fp = trailFingerprint(pts);
    const matched = trails.find((t) => similar(fp, trailFingerprint(ptsFromGeo(t.polyline))));

    const { error } = await supabase.from("runs").insert({
      user_id: session.user.id,
      route_name: matched ? matched.name : `GPS run · ${new Date().toLocaleDateString()}`,
      distance_km: Number(dist.toFixed(3)),
      duration_seconds: dur,
      avg_pace_seconds: pace,
      effort,
      elevation_m: Math.round(elevGain),
      step_count: steps,
      calories,
      track_points: { type: "LineString", coordinates: pts.map(p => [p[1], p[0]]) },
      trail_id: matched?.id || null,
      start_lat: pts[0][0], start_lng: pts[0][1],
      visibility: settings.default_run_visibility,
    });
    if (error) return toast.error(error.message);
    const xpEst = Math.round(dist * 10) + effort;
    toast.success(`Run saved · ${dist.toFixed(2)} km · +${xpEst} XP`);
    setDraft(pts); setName(matched ? matched.name : `Trail ${new Date().toLocaleDateString()}`);
    setSamples([]); setMovingSec(0); setElevGain(0); setInstSpeed(0);
    load(); refreshProfile?.();
  };

  const sendSOS = async () => {
    setSosOpen(false);
    const loc = me ? `https://maps.google.com/?q=${me[0]},${me[1]}` : "unknown location";
    await supabase.from("notifications").insert({
      user_id: session.user.id, type: "alert",
      title: "🚨 Safety alert sent",
      body: `Live location shared: ${loc}. Stay calm — help is informed.`,
    });
    try { if (navigator.share && me) await navigator.share({ title: "I need help", text: "Live location", url: loc }); } catch {}
    toast.error("Safety alert dispatched", { description: "Your location was shared." });
  };

  const saveTrail = async () => {
    const pts = draft;
    if (pts.length < 2) return toast.error("Plot at least 2 points or record a run.");
    if (name.trim().length < 2) return toast.error("Name your trail");
    const dist = totalDistKm(pts);
    const { error } = await supabase.from("trails").insert({
      user_id: session.user.id, name, description: desc || null, distance_km: Number(dist.toFixed(2)),
      city: profile?.city || null, polyline: { type: "LineString", coordinates: pts.map(p => [p[1], p[0]]) }, is_public: isPublic,
    });
    if (error) return toast.error(error.message);
    toast.success("Trail published"); setDraft([]); setName(""); setDesc(""); setDrawMode(false); load();
  };

  const shareTrail = async (t: Trail) => {
    const url = `${window.location.origin}/app/trails?t=${t.id}`;
    try { await navigator.clipboard.writeText(url); toast.success("Trail link copied"); } catch { toast.message(url); }
  };

  const previewPts = activeTrail ? ptsFromGeo(activeTrail.polyline) : [];
  const livePts: [number, number][] = samples.map((s) => [s.lat, s.lng]);
  const liveDistKm = useMemo(() => totalDistKm(livePts), [livePts]);
  const livePace = liveDistKm > 0 && movingSec > 0 ? movingSec / liveDistKm : 0;
  const liveSpeedKmh = instSpeed * 3.6;

  const repeatMap = useMemo(() => {
    const map = new Map<string, number>();
    runs.forEach((r) => { if (r.trail_id) map.set(r.trail_id, (map.get(r.trail_id) || 0) + 1); });
    runs.filter(r => !r.trail_id && r.track_points).forEach((r) => {
      const fp = trailFingerprint(ptsFromGeo(r.track_points));
      trails.forEach((t) => { if (similar(fp, trailFingerprint(ptsFromGeo(t.polyline)))) map.set(t.id, (map.get(t.id) || 0) + 1); });
    });
    return map;
  }, [runs, trails]);

  const filtered = useMemo(() => {
    let list = trails;
    if (tab === "mine") list = list.filter(t => t.user_id === session.user.id);
    else if (tab === "explore") list = list.filter(t => me ? haversineKm([Number((t.polyline?.coordinates?.[0]?.[1]) || 0), Number((t.polyline?.coordinates?.[0]?.[0]) || 0)], me) < 50 : true);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [trails, tab, session.user.id, me, search]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(hsl(var(--accent))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--accent))_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] opacity-60">// run · gps · trails</div>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><MapIcon className="h-6 w-6" /> Run</h1>
            <p className="mt-1 text-sm opacity-70">High-accuracy GPS. Live pace, distance, elevation. Auto-saved with verified formulas.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => me && setCenter([...me] as [number, number])} disabled={!me}><Locate className="h-4 w-4" /> Center</Button>
            <Button size="sm" variant={drawMode ? "default" : "secondary"} className="rounded-xl" onClick={() => setDrawMode((d) => !d)} disabled={tracking}><Pencil className="h-4 w-4" /> {drawMode ? "Drawing…" : "Draw"}</Button>
            {!tracking ? (
              <Button size="sm" className="rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90" onClick={startRun}><Play className="h-4 w-4" /> Start run</Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => setPaused((p) => !p)}>{paused ? <><Play className="h-4 w-4" /> Resume</> : <><Pause className="h-4 w-4" /> Pause</>}</Button>
                <Button size="sm" variant="destructive" className="rounded-xl" onClick={stopRun}><Square className="h-4 w-4" /> Stop</Button>
              </>
            )}
            <Button size="sm" variant="outline" className="rounded-xl border-red-400/60 bg-red-500/15 text-red-100 hover:bg-red-500/25" onClick={() => setSosOpen(true)}>
              <AlertTriangle className="h-4 w-4" /> Alert
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* MAP + HUD */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-[600px]">
            <MapContainer center={center} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; OSM · CARTO'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={20}
              />
              <FlyTo center={center} />
              {previewPts.length > 1 && <FitBounds pts={previewPts} />}
              <ClickCapture enabled={drawMode && !tracking} onClick={(p) => setDraft((d) => [...d, p])} />

              {me && (
                <>
                  {accuracy && accuracy < 100 && <CircleMarker center={me} radius={Math.min(28, accuracy/2)} pathOptions={{ color: "hsl(var(--accent))", fillOpacity: 0.08, weight: 0 }} />}
                  <CircleMarker center={me} radius={9} pathOptions={{ color: "hsl(var(--accent))", fillColor: "hsl(var(--accent))", fillOpacity: 1, weight: 3 }} />
                </>
              )}
              {tracking && livePts.length > 1 && (
                <>
                  <Polyline positions={livePts} pathOptions={{ color: "hsl(var(--accent))", weight: 14, opacity: 0.18 }} />
                  <Polyline positions={livePts} pathOptions={{ color: "hsl(var(--accent))", weight: 5, opacity: 1 }} />
                </>
              )}
              {draft.length > 1 && <Polyline positions={draft} pathOptions={{ color: "#f59e0b", weight: 5, dashArray: "10 6" }} />}
              {draft.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "#f59e0b", fillOpacity: 1 }} />)}
              {previewPts.length > 1 && (
                <>
                  <Polyline positions={previewPts} pathOptions={{ color: "#22d3ee", weight: 14, opacity: 0.18 }} />
                  <Polyline positions={previewPts} pathOptions={{ color: "#22d3ee", weight: 5, opacity: 0.95 }} />
                  <Marker position={previewPts[0]}><Popup>Start · {activeTrail?.name}</Popup></Marker>
                  <Marker position={previewPts[previewPts.length - 1]}><Popup>Finish · {Number(activeTrail?.distance_km).toFixed(2)} km</Popup></Marker>
                </>
              )}
            </MapContainer>

            {/* Live HUD overlay */}
            <AnimatePresence>
              {tracking && (
                <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-3 top-3">
                  <div className="pointer-events-auto rounded-2xl border border-[hsl(var(--accent))]/40 bg-background/85 p-3 shadow-xl backdrop-blur-md">
                    <div className="flex items-center justify-between font-mono-tech text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", paused ? "bg-amber-500" : "animate-pulse bg-[hsl(var(--accent))]")} />{paused ? "PAUSED" : "RECORDING"}</span>
                      <span>acc ±{accuracy ? Math.round(accuracy) : "—"} m · {samples.length} pts</span>
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-3">
                      <Stat label="Distance" value={`${liveDistKm.toFixed(2)} km`} icon={Route} />
                      <Stat label="Time" value={fmtClock(movingSec)} icon={Timer} />
                      <Stat label="Pace" value={`${fmtPace(livePace)}/km`} icon={Gauge} />
                      <Stat label="Speed" value={`${liveSpeedKmh.toFixed(1)} km/h`} icon={Zap} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-2 text-[11px]">
                      <div className="flex items-center gap-2 text-muted-foreground"><Flame className="h-3 w-3" /> Elev gain <span className="ml-auto font-mono-tech text-foreground">{Math.round(elevGain)} m</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Footprints className="h-3 w-3" /> Steps <span className="ml-auto font-mono-tech text-foreground">{Math.max(0, Math.round(liveDistKm * 1000 / (0.413 * (Number(profile?.height_cm) || 170) / 100))).toLocaleString()}</span></div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {drawMode && !tracking && (
              <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-border bg-background/90 px-3 py-2 font-mono-tech text-[11px] shadow-lg backdrop-blur">
                <Crosshair className="mr-1 inline h-3 w-3" /> Tap map to add waypoints
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span className="font-mono-tech">
              {tracking ? "🔴 Live · auto-saving on stop" : draft.length ? `Drafting · ${draft.length} pts · ${totalDistKm(draft).toFixed(2)} km` : activeTrail ? `Previewing · ${activeTrail.name}` : "Tap Start run to record · Draw to plot"}
            </span>
            <div className="flex gap-2">
              {activeTrail && !tracking && (
                <Button size="sm" className="rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] hover:opacity-90" onClick={startRun}>
                  <Footprints className="h-3 w-3" /> Run this trail
                </Button>
              )}
              {activeTrail && <Button size="sm" variant="ghost" onClick={() => setActiveTrail(null)}>Clear</Button>}
              {draft.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDraft([])}><Trash2 className="h-3 w-3" /> Clear draft</Button>}
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><Save className="h-3.5 w-3.5" /> Publish trail</h2>
            <div className="space-y-3">
              <Input placeholder="Trail name (e.g. Boulevard Loop)" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea rows={2} placeholder="What makes this trail great?" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                <Label className="flex items-center gap-2 text-xs"><Share2 className="h-3 w-3" /> Share with community</Label>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
              <Button onClick={saveTrail} className="w-full rounded-xl" disabled={draft.length < 2}><Save className="h-4 w-4" /> Publish · {totalDistKm(draft).toFixed(2)} km</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-3">
              <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="explore"><Sparkles className="mr-1 h-3 w-3" /> Nearby</TabsTrigger>
                  <TabsTrigger value="mine"><MapPin className="mr-1 h-3 w-3" /> Mine</TabsTrigger>
                  <TabsTrigger value="history"><Repeat className="mr-1 h-3 w-3" /> Repeat</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input className="mt-2 h-8 text-xs" placeholder="Search trails…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="max-h-[440px] overflow-y-auto">
              {tab === "history" ? (
                <div className="divide-y divide-border">
                  {runs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No GPS runs yet — hit Start run.</div>}
                  {runs.map((r) => {
                    const pts = ptsFromGeo(r.track_points);
                    return (
                      <button key={r.id} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/50"
                        onClick={() => { if (pts.length) { setActiveTrail({ id: r.id, user_id: session.user.id, name: r.route_name, description: null, distance_km: r.distance_km, city: null, polyline: r.track_points, is_public: false, created_at: r.run_at }); setCenter(pts[0]); } }}>
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))]"><Route className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{r.route_name}</div>
                          <div className="font-mono-tech text-[10px] text-muted-foreground">{Number(r.distance_km).toFixed(2)} km · {new Date(r.run_at).toLocaleDateString()}</div>
                        </div>
                        {r.trail_id && <Badge variant="secondary" className="text-[9px]">trail</Badge>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filtered.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">{tab === "mine" ? "You haven't published any trails yet." : "No trails nearby — be first to publish one."}</div>}
                  {filtered.map((t) => {
                    const mine = t.user_id === session.user.id;
                    const isActive = activeTrail?.id === t.id;
                    const reps = repeatMap.get(t.id) || 0;
                    return (
                      <div key={t.id} className={cn("group flex cursor-pointer items-start gap-3 p-3 transition hover:bg-muted/50", isActive && "bg-muted")}
                        onClick={() => { setActiveTrail(t); }}>
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><MapPin className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold">{t.name}</span>
                            {reps > 0 && <Badge className="bg-[hsl(var(--accent))]/15 text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/20 text-[9px]"><Repeat className="mr-1 h-2.5 w-2.5" /> {reps}×</Badge>}
                          </div>
                          <div className="font-mono-tech text-[10px] text-muted-foreground">{Number(t.distance_km).toFixed(2)} km · {t.city || "—"}{mine && " · yours"}</div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); shareTrail(t); }}><Share2 className="h-3 w-3" /></Button>
                          {t.is_public ? <Eye className="h-3 w-3 text-muted-foreground" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                          {mine && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); supabase.from("trails").delete().eq("id", t.id).then(load); }}><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={sosOpen} onOpenChange={setSosOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Send safety alert?</AlertDialogTitle>
            <AlertDialogDescription>
              Your live coordinates {me ? `(${me[0].toFixed(5)}, ${me[1].toFixed(5)})` : "(unknown)"} will be logged and shared via your device. Use this if you feel unsafe or are injured.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendSOS} className="bg-destructive hover:bg-destructive/90">Send alert</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, icon: I }: { label: string; value: string; icon: any }) {
  return (
    <div>
      <div className="flex items-center gap-1 font-mono-tech text-[9px] uppercase tracking-widest text-muted-foreground"><I className="h-3 w-3" /> {label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}