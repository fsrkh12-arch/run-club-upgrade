import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, Marker, Popup, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Map as MapIcon, MapPin, Save, Trash2, Play, Square, Eye, EyeOff, Route, Locate, Share2, Repeat, Sparkles, Pencil, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Fix leaflet default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Trail = { id: string; user_id: string; name: string; description: string | null; distance_km: number; city: string | null; polyline: any; is_public: boolean; created_at: string };
type Run = { id: string; route_name: string; distance_km: number; run_at: string; track_points: any; trail_id: string | null };

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
};
const totalDist = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);
const ptsFromGeo = (g: any): [number, number][] => (g?.coordinates || []).map((c: number[]) => [c[1], c[0]] as [number, number]);

// Quick trail similarity by comparing midpoints + distance
const trailFingerprint = (pts: [number, number][]) => {
  if (pts.length < 2) return null;
  const mid = pts[Math.floor(pts.length / 2)];
  return { mid, dist: totalDist(pts) };
};
const similar = (a: ReturnType<typeof trailFingerprint>, b: ReturnType<typeof trailFingerprint>) => {
  if (!a || !b) return false;
  return haversine(a.mid, b.mid) < 0.4 && Math.abs(a.dist - b.dist) / Math.max(a.dist, 0.1) < 0.2;
};

function ClickCapture({ onClick, enabled }: { onClick: (latlng: [number, number]) => void; enabled: boolean }) {
  useMapEvents({ click: (e) => enabled && onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}
function FlyTo({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 }); }, [center?.[0], center?.[1]]);
  return null;
}
function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => { if (pts.length > 1) map.fitBounds(pts as any, { padding: [40, 40] }); }, [pts.length]);
  return null;
}

export default function Trails() {
  const { session, profile } = useOutletContext<any>();
  const [trails, setTrails] = useState<Trail[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [center, setCenter] = useState<[number, number]>([40.4093, 49.8671]);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [isPublic, setIsPublic] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [trackPts, setTrackPts] = useState<[number, number][]>([]);
  const [activeTrail, setActiveTrail] = useState<Trail | null>(null);
  const [tab, setTab] = useState<"explore" | "mine" | "history">("explore");
  const [search, setSearch] = useState("");
  const watchId = useRef<number | null>(null);
  const trackStart = useRef<number>(0);

  const load = async () => {
    const [t, r] = await Promise.all([
      supabase.from("trails").select("*").or(`is_public.eq.true,user_id.eq.${session.user.id}`).order("created_at", { ascending: false }).limit(120),
      supabase.from("runs").select("id, route_name, distance_km, run_at, track_points, trail_id").eq("user_id", session.user.id).not("track_points", "is", null).order("run_at", { ascending: false }).limit(60),
    ]);
    setTrails((t.data || []) as Trail[]);
    setRuns((r.data || []) as Run[]);
  };
  useEffect(() => { load(); }, []);

  // Live position
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMe(c);
        if (tracking) setTrackPts((prev) => prev.length === 0 || haversine(prev[prev.length-1], c) > 0.005 ? [...prev, c] : prev);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [tracking]);

  useEffect(() => {
    if (me && !trackPts.length && !draft.length) setCenter(me);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.[0], me?.[1]]);

  const startTracking = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not available");
    setTrackPts(me ? [me] : []); setTracking(true); trackStart.current = Date.now();
    toast.success("GPS recording started");
  };
  const stopTracking = async () => {
    setTracking(false);
    if (trackPts.length < 2) { toast.message("No movement captured"); return; }
    const dist = totalDist(trackPts);
    const dur = Math.round((Date.now() - trackStart.current) / 1000);
    const pace = dist > 0 ? Math.round(dur / dist) : 0;
    // Auto-save run with track
    const fp = trailFingerprint(trackPts);
    const matched = trails.find((t) => similar(fp, trailFingerprint(ptsFromGeo(t.polyline))));
    const { error } = await supabase.from("runs").insert({
      user_id: session.user.id,
      route_name: matched ? matched.name : `GPS run ${new Date().toLocaleDateString()}`,
      distance_km: Number(dist.toFixed(2)),
      duration_seconds: dur,
      avg_pace_seconds: pace,
      effort: 6,
      track_points: { type: "LineString", coordinates: trackPts.map(p => [p[1], p[0]]) },
      trail_id: matched?.id || null,
      start_lat: trackPts[0][0], start_lng: trackPts[0][1],
      visibility: "private",
    });
    if (error) return toast.error(error.message);
    toast.success(matched ? `Repeat run on ${matched.name} · ${dist.toFixed(2)} km` : `Run saved · ${dist.toFixed(2)} km`);
    setDraft(trackPts); setName(matched ? matched.name : `Trail ${new Date().toLocaleDateString()}`);
    setTrackPts([]);
    load();
  };

  const saveTrail = async () => {
    const pts = draft;
    if (pts.length < 2) return toast.error("Plot at least 2 points (enable Draw mode and tap the map) or record a GPS run.");
    if (name.trim().length < 2) return toast.error("Name your trail");
    const dist = totalDist(pts);
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

  // Repeat detection: which trails has the user already run
  const repeatMap = useMemo(() => {
    const map = new Map<string, number>();
    runs.forEach((r) => { if (r.trail_id) map.set(r.trail_id, (map.get(r.trail_id) || 0) + 1); });
    // also fingerprint match for legacy runs without trail_id
    runs.filter(r => !r.trail_id && r.track_points).forEach((r) => {
      const fp = trailFingerprint(ptsFromGeo(r.track_points));
      trails.forEach((t) => { if (similar(fp, trailFingerprint(ptsFromGeo(t.polyline)))) map.set(t.id, (map.get(t.id) || 0) + 1); });
    });
    return map;
  }, [runs, trails]);

  const filtered = useMemo(() => {
    let list = trails;
    if (tab === "mine") list = list.filter(t => t.user_id === session.user.id);
    else if (tab === "explore") list = list.filter(t => me ? haversine([Number((t.polyline?.coordinates?.[0]?.[1]) || 0), Number((t.polyline?.coordinates?.[0]?.[0]) || 0)], me) < 50 : true);
    if (search) list = list.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [trails, tab, session.user.id, me, search]);

  const draftDist = totalDist(draft);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      {/* HEADER */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary to-primary/85 p-6 text-primary-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--accent))_1px,transparent_1px),linear-gradient(90deg,hsl(var(--accent))_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-tech text-[10px] uppercase tracking-[0.25em] opacity-60">// gps · trails · routes</div>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight"><MapIcon className="h-6 w-6" /> Trails & Map</h1>
            <p className="mt-1 text-sm opacity-70">Record real GPS runs, design custom routes, and discover trails near you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="rounded-xl" onClick={() => me && setCenter([...me] as [number, number])} disabled={!me}><Locate className="h-4 w-4" /> Center on me</Button>
            <Button size="sm" variant={drawMode ? "default" : "secondary"} className="rounded-xl" onClick={() => setDrawMode((d) => !d)}><Pencil className="h-4 w-4" /> {drawMode ? "Drawing…" : "Draw trail"}</Button>
            {!tracking
              ? <Button size="sm" className="rounded-xl bg-emerald-500 text-black hover:bg-emerald-400" onClick={startTracking}><Play className="h-4 w-4" /> Start GPS</Button>
              : <Button size="sm" variant="destructive" className="rounded-xl" onClick={stopTracking}><Square className="h-4 w-4" /> Stop · {trackPts.length} pts</Button>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* MAP */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative h-[560px]">
            <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FlyTo center={center} />
              {previewPts.length > 1 && <FitBounds pts={previewPts} />}
              <ClickCapture enabled={drawMode && !tracking} onClick={(p) => setDraft((d) => [...d, p])} />

              {me && (
                <>
                  <CircleMarker center={me} radius={8} pathOptions={{ color: "#10b981", fillColor: "#10b981", fillOpacity: 1, weight: 3 }} />
                  <CircleMarker center={me} radius={18} pathOptions={{ color: "#10b981", fillOpacity: 0.15, weight: 1 }} />
                </>
              )}
              {tracking && trackPts.length > 1 && <Polyline positions={trackPts} pathOptions={{ color: "#10b981", weight: 5 }} />}
              {draft.length > 1 && <Polyline positions={draft} pathOptions={{ color: "hsl(var(--accent))", weight: 5, dashArray: "10 6" }} />}
              {draft.map((p, i) => <CircleMarker key={i} center={p} radius={4} pathOptions={{ color: "hsl(var(--accent))", fillOpacity: 1 }} />)}
              {previewPts.length > 1 && (
                <>
                  <Polyline positions={previewPts} pathOptions={{ color: "#f43f5e", weight: 5 }} />
                  <Marker position={previewPts[0]}><Popup>Start · {activeTrail?.name}</Popup></Marker>
                  <Marker position={previewPts[previewPts.length - 1]}><Popup>Finish · {Number(activeTrail?.distance_km).toFixed(2)} km</Popup></Marker>
                </>
              )}
            </MapContainer>

            {/* HUD */}
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
              {tracking && (
                <div className="pointer-events-auto rounded-lg border border-emerald-500/40 bg-background/90 px-3 py-2 font-mono-tech text-xs shadow-lg backdrop-blur">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> RECORDING</div>
                  <div className="mt-1 text-foreground">{totalDist(trackPts).toFixed(2)} km · {trackPts.length} pts</div>
                </div>
              )}
              {drawMode && !tracking && (
                <div className="pointer-events-auto rounded-lg border border-border bg-background/90 px-3 py-2 font-mono-tech text-[11px] shadow-lg backdrop-blur">
                  <Crosshair className="mr-1 inline h-3 w-3" /> Tap map to add waypoints
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span className="font-mono-tech">
              {tracking ? "🔴 GPS recording…" : draft.length ? `Drafting · ${draft.length} pts · ${draftDist.toFixed(2)} km` : activeTrail ? `Previewing · ${activeTrail.name}` : "Toggle Draw to plot a trail, or Start GPS to record one"}
            </span>
            <div className="flex gap-2">
              {activeTrail && <Button size="sm" variant="ghost" onClick={() => setActiveTrail(null)}>Clear preview</Button>}
              {draft.length > 0 && <Button size="sm" variant="ghost" onClick={() => setDraft([])}><Trash2 className="h-3 w-3" /> Clear draft</Button>}
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">
          {/* Save trail */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><Save className="h-3.5 w-3.5" /> Publish trail</h2>
            <div className="space-y-3">
              <Input placeholder="Trail name (e.g. Boulevard Loop)" value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea rows={2} placeholder="What makes this trail great?" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-2.5">
                <Label className="flex items-center gap-2 text-xs"><Share2 className="h-3 w-3" /> Share with community</Label>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>
              <Button onClick={saveTrail} className="w-full rounded-xl" disabled={draft.length < 2}><Save className="h-4 w-4" /> Publish · {draftDist.toFixed(2)} km</Button>
            </div>
          </div>

          {/* Trail list */}
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
                  {runs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No GPS runs yet — hit Start GPS to record one.</div>}
                  {runs.map((r) => {
                    const pts = ptsFromGeo(r.track_points);
                    return (
                      <button key={r.id} className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-muted/50"
                        onClick={() => { if (pts.length) { setActiveTrail({ id: r.id, user_id: session.user.id, name: r.route_name, description: null, distance_km: r.distance_km, city: null, polyline: r.track_points, is_public: false, created_at: r.run_at }); setCenter(pts[0]); } }}>
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-500"><Route className="h-4 w-4" /></div>
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
                            {reps > 0 && <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 text-[9px]"><Repeat className="mr-1 h-2.5 w-2.5" /> {reps}×</Badge>}
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
    </div>
  );
}