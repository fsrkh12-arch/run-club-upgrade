import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Map as MapIcon, MapPin, Plus, Save, Trash2, Play, Square, Eye, EyeOff, Route } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Trail = { id: string; user_id: string; name: string; description: string | null; distance_km: number; city: string | null; polyline: any; is_public: boolean; created_at: string };

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]), dLng = toRad(b[1] - a[1]);
  const x = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
};
const totalDist = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + haversine(pts[i], p), 0);

function ClickCapture({ onClick }: { onClick: (latlng: [number, number]) => void }) {
  useMapEvents({ click: (e) => onClick([e.latlng.lat, e.latlng.lng]) });
  return null;
}
function Recenter({ center }: { center: [number, number] }) {
  const map = useMap(); useEffect(() => { map.setView(center, map.getZoom()); }, [center.join(",")]); return null;
}

export default function Trails() {
  const { session, profile } = useOutletContext<any>();
  const [trails, setTrails] = useState<Trail[]>([]);
  const [center, setCenter] = useState<[number, number]>([40.4093, 49.8671]); // Baku
  const [me, setMe] = useState<[number, number] | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [name, setName] = useState(""); const [desc, setDesc] = useState(""); const [isPublic, setIsPublic] = useState(true);
  const [tracking, setTracking] = useState(false);
  const [trackPts, setTrackPts] = useState<[number, number][]>([]);
  const [activeTrail, setActiveTrail] = useState<Trail | null>(null);
  const watchId = useRef<number | null>(null);

  const load = async () => {
    const { data } = await supabase.from("trails").select("*").or(`is_public.eq.true,user_id.eq.${session.user.id}`).order("created_at", { ascending: false }).limit(60);
    setTrails((data || []) as Trail[]);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setCenter(c); setMe(c);
    }, () => {});
  }, []);

  const startTracking = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not available");
    setTrackPts([]); setTracking(true);
    watchId.current = navigator.geolocation.watchPosition((pos) => {
      const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setMe(p); setTrackPts((prev) => [...prev, p]);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 1000 });
    toast.success("Tracking started");
  };
  const stopTracking = async () => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    setTracking(false);
    if (trackPts.length < 2) return toast.message("No path captured");
    const dist = totalDist(trackPts);
    setDraft(trackPts); setName(`Run ${new Date().toLocaleDateString()}`);
    toast.success(`Captured ${dist.toFixed(2)} km`);
  };

  const saveTrail = async () => {
    const pts = draft.length >= 2 ? draft : trackPts;
    if (pts.length < 2) return toast.error("Tap on the map to plot at least 2 points or record a run.");
    if (name.trim().length < 2) return toast.error("Name your trail");
    const dist = totalDist(pts);
    const { error } = await supabase.from("trails").insert({
      user_id: session.user.id, name, description: desc || null, distance_km: dist,
      city: profile?.city || null, polyline: { type: "LineString", coordinates: pts.map(p => [p[1], p[0]]) }, is_public: isPublic,
    });
    if (error) return toast.error(error.message);
    toast.success("Trail saved"); setDraft([]); setName(""); setDesc(""); setTrackPts([]); load();
  };

  const trailPoints = (t: Trail): [number, number][] =>
    (t.polyline?.coordinates || []).map((c: number[]) => [c[1], c[0]] as [number, number]);

  const previewPts = activeTrail ? trailPoints(activeTrail) : [];
  const currentDraftDist = useMemo(() => totalDist(draft.length >= 2 ? draft : trackPts), [draft, trackPts]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 md:p-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><MapIcon className="h-5 w-5" /> Trails & Map</h1>
            <p className="mt-1 text-sm text-muted-foreground">Record GPS runs, design custom trails, and discover community routes near you.</p>
          </div>
          <div className="flex gap-2">
            {!tracking ? <Button onClick={startTracking}><Play className="h-4 w-4" /> Start GPS</Button> : <Button variant="destructive" onClick={stopTracking}><Square className="h-4 w-4" /> Stop ({trackPts.length} pts)</Button>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-[520px]">
            <MapContainer center={center} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Recenter center={center} />
              {!tracking && draft.length === 0 && previewPts.length === 0 && <ClickCapture onClick={(p) => setDraft((d) => [...d, p])} />}
              {!tracking && draft.length === 0 && previewPts.length === 0 && (
                <></>
              )}
              {me && <Marker position={me} />}
              {trackPts.length > 1 && <Polyline positions={trackPts} pathOptions={{ color: "#10b981", weight: 5 }} />}
              {draft.length > 1 && <Polyline positions={draft} pathOptions={{ color: "hsl(var(--primary))", weight: 5, dashArray: "8 8" }} />}
              {previewPts.length > 1 && <Polyline positions={previewPts} pathOptions={{ color: "#f43f5e", weight: 5 }} />}
            </MapContainer>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
            <span className="font-mono-tech">{tracking ? "🔴 Recording" : draft.length ? `Drafting · ${draft.length} pts · ${currentDraftDist.toFixed(2)} km` : "Tap on map to start a custom trail, or use GPS"}</span>
            {(draft.length > 0 || trackPts.length > 0) && <Button variant="ghost" size="sm" onClick={() => { setDraft([]); setTrackPts([]); }}><Trash2 className="h-3 w-3" /> Clear</Button>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h2 className="font-semibold">Save trail</h2>
            <Input placeholder="Trail name" value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea placeholder="Notes / description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <div className="flex items-center justify-between rounded-lg border border-border p-2">
              <Label>Public to community</Label>
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <Button onClick={saveTrail} className="w-full"><Save className="h-4 w-4" /> Save · {currentDraftDist.toFixed(2)} km</Button>
          </div>

          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4"><h2 className="font-semibold flex items-center gap-2"><Route className="h-4 w-4" /> Nearby & yours</h2><span className="font-mono-tech text-[10px] text-muted-foreground">{trails.length}</span></div>
            <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
              {trails.map((t) => {
                const mine = t.user_id === session.user.id;
                const isActive = activeTrail?.id === t.id;
                return (
                  <div key={t.id} className={`flex cursor-pointer items-start gap-3 p-3 transition hover:bg-muted/50 ${isActive ? "bg-muted" : ""}`}
                    onClick={() => { setActiveTrail(t); const pts = trailPoints(t); if (pts[0]) setCenter(pts[0]); }}>
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><MapPin className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-semibold">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground">{Number(t.distance_km).toFixed(2)} km · {t.city || "—"} {mine && "· yours"}</div>
                    </div>
                    {t.is_public ? <Eye className="h-3 w-3 text-muted-foreground" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                    {mine && <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); supabase.from("trails").delete().eq("id", t.id).then(load); }}><Trash2 className="h-3 w-3" /></Button>}
                  </div>
                );
              })}
              {trails.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No trails yet. Be the first to share one.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
