/**
 * PACE CLUB BAKU — v4.0
 * ─────────────────────────────────────────────────────────
 * Architecture layers (strict separation):
 *
 *  [1] RAW DATA LAYER      — GPS coords, timestamps, HR samples
 *  [2] COMPUTATION ENGINE  — pure functions: EMA, physiology,
 *                            haversine, TRIMP, VO2, fatigue model
 *  [3] UNIFIED UPDATE LOOP — single requestAnimationFrame master
 *                            clock driving ALL live subsystems:
 *                            physiology → alerts → UI in priority order
 *  [4] GEOFENCE ENGINE     — zone proximity, dedup throttle, push
 *  [5] NOTIFICATION BUS    — priority queue, SW registration
 *  [6] MEMOIZED SELECTORS  — derived values never stored in state
 *  [7] STABLE MAP SYSTEM   — diffed Leaflet layers, coord simplification
 *  [8] UI LAYER            — pure React, zero business logic
 * ─────────────────────────────────────────────────────────
 */

import {
  useState, useEffect, useRef, useCallback,
  useMemo, memo, useReducer,
} from "react";

/* ═══════════════════════════════════════════════════════
   [1] CONSTANTS — defined once, frozen, never recreated
═══════════════════════════════════════════════════════ */
const K = Object.freeze({
  /* Timing */
  LOOP_HZ:          4,          // master loop tick rate (4 Hz)
  LOOP_MS:          250,        // 1000 / LOOP_HZ
  HR_EMA_ALPHA:     0.12,       // HR smoothing (lower = smoother)
  PACE_EMA_ALPHA:   0.08,       // pace smoothing
  FAT_EMA_ALPHA:    0.04,       // fatigue smoothing
  GPS_MIN_DIST_M:   3,          // ignore GPS jitter < 3 m
  GPS_SIMPLIFY_M:   8,          // Ramer-Douglas-Peucker epsilon (m)
  COORD_MAX:        400,        // max stored coords before simplification
  /* Physiology */
  KCAL_PER_KG_KM:   1.036,      // Léger & Mercier 1984
  FAT_RATE:         0.0014,     // fatigue accumulation per second at HR=160
  FAT_DECAY:        0.00008,    // passive recovery rate per second (rest)
  FAT_SESSION_DECAY:0.35,       // inter-session recovery factor
  CADENCE_BASE:     183,        // spm at 5:00/km (Heiderscheit 2011)
  CADENCE_SLOPE:    3.5,        // spm drop per 0.5 min/km above 5:00
  /* Geofence */
  GEO_CHECK_INTERVAL_MS: 8000,  // geofence poll interval
  GEO_ALERT_COOLDOWN_MS: 60000, // min ms between same-zone alerts
  /* Design tokens */
  ANIM_FAST:   "180ms",
  ANIM_MED:    "280ms",
  ANIM_SLOW:   "420ms",
  EASE_OUT:    "cubic-bezier(0.2,0,0,1)",
  EASE_SPRING: "cubic-bezier(0.34,1.56,0.64,1)",
});

const PALETTE = Object.freeze({
  bg:         "#F4EFE6",
  surface:    "#FDFAF4",
  surfaceAlt: "#F9F4EC",
  border:     "#E6DDD0",
  borderMid:  "#D4C8B8",
  accent:     "#7A5C0C",
  accentWarm: "#B8882A",
  accentFaint:"#EDE4D4",
  text:       "#221A08",
  textMid:    "#6A5C40",
  textFaint:  "#A89878",
  success:    "#3D6E2E",
  successBg:  "#E8F2E4",
  danger:     "#962818",
  dangerBg:   "#F6E8E4",
  warn:       "#8A5C14",
  warnBg:     "#F5EDD8",
  info:       "#1C4E6A",
  infoBg:     "#E2EDF5",
  liveRed:    "#CC3311",
  overlay:    "rgba(34,26,8,0.52)",
});

/* ═══════════════════════════════════════════════════════
   [2] COMPUTATION ENGINE — pure, no React, no side-effects
═══════════════════════════════════════════════════════ */
const Eng = (() => {
  /* EMA — exponential moving average */
  function ema(prev, next, alpha) {
    if (prev === null || prev === undefined) return next;
    return prev * (1 - alpha) + next * alpha;
  }

  /* Haversine distance in metres between two [lat,lon] pairs */
  function haversineM(a, b) {
    const R = 6_371_000;
    const φ1 = a[0] * (Math.PI / 180), φ2 = b[0] * (Math.PI / 180);
    const Δφ = (b[0] - a[0]) * (Math.PI / 180);
    const Δλ = (b[1] - a[1]) * (Math.PI / 180);
    const s  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  }
  const haversineKm = (a, b) => haversineM(a, b) / 1000;

  /* Ramer-Douglas-Peucker line simplification */
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    let maxD = 0, maxI = 0;
    const [x1,y1] = pts[0], [x2,y2] = pts[pts.length-1];
    const dx = x2-x1, dy = y2-y1, len = Math.hypot(dx,dy) || 1e-10;
    for (let i = 1; i < pts.length-1; i++) {
      const d = Math.abs(dy*pts[i][0] - dx*pts[i][1] + x2*y1 - y2*x1) / len;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) {
      const l = rdp(pts.slice(0, maxI+1), eps);
      const r = rdp(pts.slice(maxI), eps);
      return [...l.slice(0,-1), ...r];
    }
    return [pts[0], pts[pts.length-1]];
  }

  /* Pace in min/km — null-safe */
  function pace(km, sec) {
    if (!km || km < 0.005 || !sec || sec < 1) return null;
    return sec / 60 / km;
  }
  function fmtPace(v) {
    if (!v || !isFinite(v) || v > 30) return "–:––";
    const m = Math.floor(v), s = Math.round((v - m) * 60);
    return `${m}:${String(s < 60 ? s : 59).padStart(2,"0")}`;
  }
  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
    return h > 0
      ? `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`
      : `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  }

  /* Calories — 1.036 kcal/kg/km */
  const calories = (km, kg) => Math.round(km * kg * K.KCAL_PER_KG_KM);

  /* VO2max from pace — Jack Daniels VDOT (LUT for zero runtime cost) */
  const _v2lut = new Map();
  function vo2Pace(paceMinKm) {
    if (!paceMinKm || !isFinite(paceMinKm)) return 0;
    const key = Math.round(paceMinKm * 10);
    if (_v2lut.has(key)) return _v2lut.get(key);
    const spd = 1000 / paceMinKm; // m/min
    const v = Math.max(0, Math.round(-4.6 + 0.182258*spd + 0.000104*spd**2));
    _v2lut.set(key, v);
    return v;
  }

  /* VO2max from HR — Uth-Sørensen-Overgaard-Pedersen 2004 */
  const vo2HR = (hrMax, hrRest) => Math.round(15 * (hrMax / hrRest));

  /* TRIMP — Banister 1991 (gender-neutral) */
  function trimp(durMin, avgHR, hrRest, hrMax) {
    if (!durMin || !avgHR) return 0;
    const r = Math.min(1, Math.max(0, (avgHR - hrRest) / (hrMax - hrRest)));
    return Math.round(durMin * r * 0.64 * Math.exp(1.92 * r));
  }

  /* Cadence — Heiderscheit et al. 2011 */
  const _cadLut = new Map();
  function cadence(paceMinKm) {
    if (!paceMinKm) return 0;
    const key = Math.round(paceMinKm * 10);
    if (_cadLut.has(key)) return _cadLut.get(key);
    const v = Math.max(152, Math.round(K.CADENCE_BASE - Math.max(0, (paceMinKm - 5) * K.CADENCE_SLOPE)));
    _cadLut.set(key, v);
    return v;
  }
  const steps = (durSec, paceMinKm) => Math.round((durSec / 60) * cadence(paceMinKm));

  /* ─── PHYSIOLOGICAL MODEL ─────────────────────────────
   * HR responds to: current pace effort, accumulated fatigue,
   * cardiac drift (time-on-feet), and elevation grade.
   *
   * Fatigue model:
   *   - accumulates proportionally to HR ratio
   *   - decays passively at rest
   *   - influences HR drift and pace degradation
   *
   * EMA-smoothed outputs eliminate jitter.
   ───────────────────────────────────────────────────── */
  function physioStep(state, { paceMinKm, elapsedSec, gradePercent = 0 }, profile) {
    const { hrRest, hrMax } = profile;

    // Effort 0–1 from pace (0 = walking, 1 = sprint)
    const effortRaw = paceMinKm
      ? Math.min(1, Math.max(0, (8 - paceMinKm) / 5))
      : 0;

    // Grade adjustment: +1% grade ≈ +4 bpm (Minetti 2002)
    const gradeBonus = Math.min(0.12, gradePercent * 0.012);

    // Cardiac drift: +0.5 bpm/min after 20 min (Coyle & Gonzalez-Alonso 2001)
    const drift = Math.min(0.10, Math.max(0, (elapsedSec - 1200) / 3600) * 0.5 / (hrMax - hrRest));

    // Fatigue influence on HR: fatigue adds up to 15% of HR reserve
    const fatInfluence = Math.min(0.15, state.fatigue * 0.18);

    // Target HR
    const targetRatio = Math.min(0.98, effortRaw + gradeBonus + drift + fatInfluence);
    const targetHR    = hrRest + (hrMax - hrRest) * targetRatio;

    // EMA-smoothed HR (lag simulates cardiovascular response time)
    const smoothedHR = Math.min(hrMax, Math.round(ema(state.hrSmooth, targetHR, K.HR_EMA_ALPHA)));

    // Fatigue accumulation: proportional to HR ratio, faster at high effort
    const hrRatio     = (smoothedHR - hrRest) / (hrMax - hrRest);
    const fatDelta    = K.FAT_RATE * hrRatio * (K.LOOP_MS / 1000);
    const newFatigue  = Math.min(1, state.fatigue + fatDelta);

    // Fatigue degrades pace by up to 8% at max fatigue
    const paceDegraded = paceMinKm
      ? paceMinKm * (1 + newFatigue * 0.08)
      : null;

    // EMA-smoothed pace
    const smoothedPace = paceMinKm
      ? ema(state.paceSmooth, paceDegraded, K.PACE_EMA_ALPHA)
      : state.paceSmooth;

    return {
      hrSmooth:   smoothedHR,
      paceSmooth: smoothedPace,
      fatigue:    newFatigue,
      hrRatio,
      effort:     effortRaw,
    };
  }

  function physioRest(state) {
    return {
      ...state,
      fatigue:  Math.max(0, state.fatigue - K.FAT_DECAY * (K.LOOP_MS / 1000)),
      hrSmooth: ema(state.hrSmooth, state.hrSmooth > 80 ? state.hrSmooth - 2 : 62, 0.04),
    };
  }

  const physioInitial = (hrRest = 62) => ({
    hrSmooth: hrRest, paceSmooth: null,
    fatigue: 0, hrRatio: 0, effort: 0,
  });

  /* Abnormal HR detection thresholds */
  function hrAlert(hr, hrMax, hrRest) {
    if (hr >= hrMax * 0.97) return "critical";
    if (hr >= hrMax * 0.92) return "high";
    if (hr <= hrRest * 0.85 && hr < 45) return "low";
    return null;
  }

  return {
    ema, haversineM, haversineKm, rdp,
    pace, fmtPace, fmtTime,
    calories, vo2Pace, vo2HR, trimp, cadence, steps,
    physioStep, physioRest, physioInitial, hrAlert,
  };
})();

/* ═══════════════════════════════════════════════════════
   STATIC DATA — module-level, never recreated
═══════════════════════════════════════════════════════ */
const PROFILE_DEFAULT = Object.freeze({
  name:"Amir Hasanov", nameAz:"Əmir Həsənov",
  weight:72, age:28, hrMax:190, hrRest:62,
  fearDogs:false, fearWildlife:false, alertRadius:150,
});

const BAKU_TRAILS = Object.freeze([
  { id:1, name:"Bulvar Coastal Run",  nameAz:"Bulvar Sahil Qaçışı",  distKm:5.2, diff:"easy",     elev:12,  rating:4.9, reports:0, authorId:"pcb", author:"PCB Official", shared:true,
    coords:[[40.3663,49.8370],[40.3660,49.8420],[40.3655,49.8480],[40.3648,49.8540],[40.3642,49.8600],[40.3638,49.8650],[40.3635,49.8700],[40.3630,49.8740],[40.3628,49.8780]] },
  { id:2, name:"Old City Loop",       nameAz:"Köhnə Şəhər Dövrəsi", distKm:3.8, diff:"moderate",  elev:48,  rating:4.7, reports:0, authorId:"pcb", author:"PCB Official", shared:true,
    coords:[[40.3659,49.8370],[40.3680,49.8360],[40.3700,49.8340],[40.3720,49.8320],[40.3710,49.8300],[40.3690,49.8310],[40.3670,49.8330],[40.3659,49.8370]] },
  { id:3, name:"Highland Park",       nameAz:"Dağ Parkı Marşrutu",  distKm:8.1, diff:"hard",      elev:120, rating:4.8, reports:2, authorId:"pcb", author:"PCB Official", shared:true,
    coords:[[40.3780,49.8420],[40.3800,49.8440],[40.3820,49.8460],[40.3840,49.8480],[40.3860,49.8500],[40.3850,49.8530],[40.3830,49.8520],[40.3810,49.8510],[40.3790,49.8490],[40.3780,49.8420]] },
  { id:4, name:"Crystal Hall Sprint", nameAz:"Kristal Zal Sprinti",  distKm:2.5, diff:"easy",     elev:8,   rating:4.6, reports:0, authorId:"pcb", author:"PCB Official", shared:true,
    coords:[[40.3600,49.8700],[40.3595,49.8750],[40.3590,49.8800],[40.3585,49.8840],[40.3582,49.8870]] },
]);

/* Geofence danger zones */
const GEO_ZONES = Object.freeze([
  { id:"z1", name:"Loose dogs reported",  lat:40.3648, lon:49.8540, radius:180, type:"dogs",    severity:"warn"   },
  { id:"z2", name:"Wet surface — slippery",lat:40.3638,lon:49.8650, radius:120, type:"surface", severity:"warn"   },
  { id:"z3", name:"Highland rockfall risk",lat:40.3840, lon:49.8480, radius:250, type:"hazard",  severity:"danger" },
  { id:"z4", name:"Night — poor lighting", lat:40.3700, lon:49.8340, radius:200, type:"light",   severity:"info"   },
]);

/* Seed run pipeline processed once at module load */
function processRunOnce(raw) {
  const p = Eng.pace(raw.distKm, raw.timeSec);
  return {
    ...raw,
    pace:    p,
    paceFmt: Eng.fmtPace(p),
    timeFmt: Eng.fmtTime(raw.timeSec),
    cals:    Eng.calories(raw.distKm, PROFILE_DEFAULT.weight),
    steps:   Eng.steps(raw.timeSec, p),
    cadence: Eng.cadence(p),
    load:    Eng.trimp(raw.timeSec/60, raw.hrAvg, PROFILE_DEFAULT.hrRest, PROFILE_DEFAULT.hrMax),
    vo2:     Eng.vo2Pace(p),
  };
}
const SEED_RUNS = Object.freeze([
  { id:"r1", date:"Apr 29", trail:"Bulvar Coastal Run", trailAz:"Bulvar Sahil", distKm:8.24, timeSec:2772, hrAvg:158 },
  { id:"r2", date:"Apr 27", trail:"Old City Loop",      trailAz:"Köhnə Şəhər",  distKm:4.12, timeSec:1360, hrAvg:152 },
  { id:"r3", date:"Apr 25", trail:"Highland Park",      trailAz:"Dağ Parkı",    distKm:8.10, timeSec:2916, hrAvg:164 },
  { id:"r4", date:"Apr 23", trail:"Bulvar Coastal Run", trailAz:"Bulvar Sahil", distKm:5.20, timeSec:1794, hrAvg:155 },
  { id:"r5", date:"Apr 21", trail:"Crystal Hall",       trailAz:"Kristal Zal",  distKm:2.50, timeSec: 795, hrAvg:148 },
].map(processRunOnce));

const LEADERBOARD = Object.freeze([
  { rank:1, name:"Leyla M.",  nameAz:"Leyla M.",  km:87.4, streak:21, runs:14, avgPace:5.22, initials:"LM" },
  { rank:2, name:"Rashad A.", nameAz:"Rəşad A.", km:74.2, streak:14, runs:11, avgPace:5.41, initials:"RA" },
  { rank:3, name:"Nigar K.",  nameAz:"Nigar K.",  km:68.9, streak:18, runs:12, avgPace:5.35, initials:"NK" },
  { rank:4, name:"Amir H.",   nameAz:"Əmir H.",   km:61.3, streak:9,  runs:9,  avgPace:5.42, initials:"AH", isUser:true },
  { rank:5, name:"Farid T.",  nameAz:"Fərid T.",  km:55.7, streak:7,  runs:8,  avgPace:5.58, initials:"FT" },
]);

const SEED_CHAT = [
  { id:"c1", user:"Leyla M.",  initials:"LM", time:"9:14 AM",  text:"Just finished Bulvar — perfect conditions today, wind was great!", likes:4 },
  { id:"c2", user:"Rashad A.", initials:"RA", time:"9:32 AM",  text:"Did Highland Park. Watch the loose gravel near km 3.", likes:7 },
  { id:"c3", user:"Nigar K.",  initials:"NK", time:"10:05 AM", text:"New PR on Old City Loop! 4:58/km average 🎉", likes:12 },
];

const WEEKLY_KM  = Object.freeze([9.2, 0, 8.1, 0, 12.4, 8.24, 0]);
const PACE_HIST  = Object.freeze([6.1, 5.9, 5.7, 5.8, 5.55, 5.6, 5.42, 5.38]);
const DAYS       = Object.freeze({ en:["M","T","W","T","F","S","S"], az:["B","Ç","Ç","C","C","Ş","B"] });

/* ═══════════════════════════════════════════════════════
   [4] NOTIFICATION BUS — priority queue + SW bridge
═══════════════════════════════════════════════════════ */
const NotifBus = (() => {
  // Priority: 0=critical, 1=high, 2=medium, 3=low
  const queue   = [];
  const shown   = new Set(); // dedup by id
  const listeners = new Set();

  function emit(n) { listeners.forEach(fn => fn(n)); }

  function push({ id, title, body, priority = 2, persistent = false, type = "info" }) {
    if (shown.has(id)) return; // deduplicate
    shown.add(id);
    const notif = { id, title, body, priority, persistent, type, ts: Date.now() };
    // Insert sorted by priority
    const idx = queue.findIndex(n => n.priority > notif.priority);
    if (idx === -1) queue.push(notif); else queue.splice(idx, 0, notif);
    emit(notif);
    // Clear dedup after cooldown for non-persistent
    if (!persistent) setTimeout(() => shown.delete(id), K.GEO_ALERT_COOLDOWN_MS);
  }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  // SW registration for Web Push (VAPID)
  async function registerSW() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    try {
      const reg = await navigator.serviceWorker.register(
        URL.createObjectURL(new Blob([`
          self.addEventListener('push', e => {
            const d = e.data?.json() || {};
            self.registration.showNotification(d.title || 'PCB Alert', {
              body: d.body || '', icon: '/icon-192.png',
              badge: '/badge.png', vibrate: [200,100,200],
              data: d,
            });
          });
          self.addEventListener('notificationclick', e => {
            e.notification.close();
            clients.openWindow('/');
          });
        `], { type:"application/javascript" }))
      );
      return reg;
    } catch { return null; }
  }

  // Request browser notification permission
  async function requestPermission() {
    if (!("Notification" in window)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    return Notification.requestPermission();
  }

  // Show native browser notification (fallback when app is backgrounded)
  function nativeNotify(title, body, priority = 2) {
    if (Notification.permission !== "granted") return;
    if (priority > 1) return; // only for high/critical
    try { new Notification(title, { body, icon: "/icon-192.png", vibrate:[200,100] }); } catch {}
  }

  return { push, subscribe, registerSW, requestPermission, nativeNotify };
})();

/* ═══════════════════════════════════════════════════════
   PROFANITY FILTER — compiled once
═══════════════════════════════════════════════════════ */
const ProfFilter = (() => {
  const ws = ["fuck","shit","bitch","asshole","cunt","dick","bastard"];
  const compiled = ws.map(w => ({
    re: new RegExp(`\\b${w}\\b`, "gi"), star: "*".repeat(w.length),
  }));
  const testRe = new RegExp(ws.map(w => `\\b${w}\\b`).join("|"), "i");
  return {
    has:   t => testRe.test(t),
    clean: t => compiled.reduce((s, {re, star}) => s.replace(re, star), t),
  };
})();

/* ═══════════════════════════════════════════════════════
   [7] MAP SYSTEM — Leaflet, persistent refs, diffed layers
   Injected once globally, never inside component tree.
═══════════════════════════════════════════════════════ */
let _leafletReady = false;
const _leafletCallbacks = [];
function loadLeaflet(cb) {
  if (window.L) { cb(); return; }
  if (_leafletCallbacks.length === 0) {
    const lnk = Object.assign(document.createElement("link"),
      { rel:"stylesheet", href:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" });
    document.head.appendChild(lnk);
    const scr = document.createElement("script");
    scr.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    scr.onload = () => { _leafletReady = true; _leafletCallbacks.forEach(f => f()); _leafletCallbacks.length = 0; };
    document.head.appendChild(scr);
  }
  _leafletCallbacks.push(cb);
}

const PCBMap = memo(function PCBMap({
  trails = [],       // stable array ref, memoized at parent
  runCoords = null,  // raw GPS array — only length triggers update
  recCoords = null,
  zones = [],
  height = 210,
}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const trailRefs    = useRef(new Map()); // id → {poly, dotS, dotE}
  const runPolyRef   = useRef(null);
  const recPolyRef   = useRef(null);
  const zoneRefs     = useRef(new Map()); // zone.id → circle
  const rafRef       = useRef(null);

  // Init map exactly once
  useEffect(() => {
    let cancelled = false;
    loadLeaflet(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = window.L.map(containerRef.current, {
        center:[40.366,49.854], zoom:13,
        zoomControl:false, attributionControl:false,
      });
      window.L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { subdomains:"abcd", maxZoom:19 }
      ).addTo(map);
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  // Diff trail layers — only add/remove what changed
  useEffect(() => {
    const L = window.L; if (!L || !mapRef.current) return;
    const map = mapRef.current;
    const incoming = new Map(trails.map(t => [t.id, t]));

    for (const [id, refs] of trailRefs.current) {
      if (!incoming.has(id)) {
        try { refs.poly.remove(); refs.dotS.remove(); refs.dotE.remove(); } catch {}
        trailRefs.current.delete(id);
      }
    }

    const newCoords = [];
    for (const [id, trail] of incoming) {
      newCoords.push(...(trail.coords || []));
      if (trailRefs.current.has(id)) continue;
      if (!trail.coords || trail.coords.length < 2) continue;
      const col = trail.isPersonal ? PALETTE.success : PALETTE.accent;
      const simplified = Eng.rdp(trail.coords, K.GPS_SIMPLIFY_M / 111000);
      const poly = L.polyline(simplified, { color:col, weight:4, opacity:0.82 }).addTo(map);
      const mk = (c, r) => L.circleMarker(c, { radius:r, color:col, fillColor:"#FDFAF4", fillOpacity:1, weight:2 }).addTo(map);
      const c = trail.coords;
      trailRefs.current.set(id, { poly, dotS:mk(c[0],6), dotE:mk(c[c.length-1],4) });
    }

    if (newCoords.length > 1 && !runCoords?.length && !recCoords?.length) {
      try { map.fitBounds(L.latLngBounds(newCoords), { padding:[36,36], maxZoom:15 }); } catch {}
    }
  }, [trails]);

  // Diff zone circles
  useEffect(() => {
    const L = window.L; if (!L || !mapRef.current) return;
    const incoming = new Map(zones.map(z => [z.id, z]));
    for (const [id, c] of zoneRefs.current) {
      if (!incoming.has(id)) { try { c.remove(); } catch {} zoneRefs.current.delete(id); }
    }
    for (const [id, zone] of incoming) {
      if (zoneRefs.current.has(id)) continue;
      const col = zone.severity === "danger" ? PALETTE.danger : zone.severity === "warn" ? PALETTE.warn : PALETTE.info;
      const c = window.L.circle([zone.lat, zone.lon], {
        radius: zone.radius, color: col, fillColor: col,
        fillOpacity: 0.10, weight: 1.5, dashArray: "4 4",
      }).addTo(mapRef.current);
      zoneRefs.current.set(id, c);
    }
  }, [zones]);

  // RAF-batched run path update — only on length change
  useEffect(() => {
    if (!runCoords?.length) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const L = window.L; if (!L || !mapRef.current) return;
      if (runPolyRef.current) { try { runPolyRef.current.setLatLngs(runCoords); } catch {} }
      else { runPolyRef.current = L.polyline(runCoords, { color:PALETTE.liveRed, weight:4, opacity:0.95, dashArray:"6 3" }).addTo(mapRef.current); }
      try { mapRef.current.panTo(runCoords[runCoords.length-1], { animate:true, duration:0.8 }); } catch {}
    });
  }, [runCoords?.length]);

  // RAF-batched recording path update
  useEffect(() => {
    if (!recCoords?.length) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const L = window.L; if (!L || !mapRef.current) return;
      if (recPolyRef.current) { try { recPolyRef.current.setLatLngs(recCoords); } catch {} }
      else { recPolyRef.current = L.polyline(recCoords, { color:PALETTE.danger, weight:5, opacity:1 }).addTo(mapRef.current); }
      try { mapRef.current.panTo(recCoords[recCoords.length-1], { animate:true, duration:0.8 }); } catch {}
    });
  }, [recCoords?.length]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div ref={containerRef}
      style={{ borderRadius:12, overflow:"hidden", height, border:`1px solid ${PALETTE.border}`,
               background:"#E8E4DC", flex:"none" }}
    />
  );
}, (prev, next) =>
  JSON.stringify(prev.trails.map(t => t.id)) === JSON.stringify(next.trails.map(t => t.id)) &&
  prev.runCoords?.length === next.runCoords?.length &&
  prev.recCoords?.length === next.recCoords?.length &&
  JSON.stringify(prev.zones.map(z => z.id)) === JSON.stringify(next.zones.map(z => z.id)) &&
  prev.height === next.height
);

/* ═══════════════════════════════════════════════════════
   ICONS — memo'd, consistent 1.6 stroke, semantic palette
═══════════════════════════════════════════════════════ */
const PATHS = {
  home:   [<path key="h" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>],
  run:    [<circle key="c" cx="12" cy="5" r="2"/>, <path key="p" d="M15 10l-2 5-3 2-1 4M9 10l-2 3"/>],
  map:    [<polygon key="g" points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>, <line key="l1" x1="8" y1="2" x2="8" y2="18"/>, <line key="l2" x1="16" y1="6" x2="16" y2="22"/>],
  users:  [<path key="p" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>, <circle key="c" cx="9" cy="7" r="4"/>, <path key="p2" d="M23 21v-2a4 4 0 0 0-3-3.87"/>, <path key="p3" d="M16 3.13a4 4 0 0 1 0 7.75"/>],
  user:   [<path key="p" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>, <circle key="c" cx="12" cy="7" r="4"/>],
  gear:   [<circle key="c" cx="12" cy="12" r="3"/>, <path key="p" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>],
  send:   [<line key="l" x1="22" y1="2" x2="11" y2="13"/>, <polygon key="p" points="22 2 15 22 11 13 2 9 22 2"/>],
  heart:  [<path key="p" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>],
  share:  [<circle key="c1" cx="18" cy="5" r="3"/>, <circle key="c2" cx="6" cy="12" r="3"/>, <circle key="c3" cx="18" cy="19" r="3"/>, <line key="l1" x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>, <line key="l2" x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>],
  edit:   [<path key="p1" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>, <path key="p2" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>],
  lock:   [<rect key="r" x="3" y="11" width="18" height="11" rx="2" ry="2"/>, <path key="p" d="M7 11V7a5 5 0 0 1 10 0v4"/>],
  globe:  [<circle key="c" cx="12" cy="12" r="10"/>, <line key="l" x1="2" y1="12" x2="22" y2="12"/>, <path key="p" d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>],
  alert:  [<path key="p" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>, <line key="l1" x1="12" y1="9" x2="12" y2="13"/>, <line key="l2" x1="12" y1="17" x2="12.01" y2="17"/>],
  record: [<circle key="c1" cx="12" cy="12" r="10"/>, <circle key="c2" cx="12" cy="12" r="3" fill="currentColor"/>],
  bell:   [<path key="p" d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>, <path key="p2" d="M13.73 21a2 2 0 0 1-3.46 0"/>],
  x:      [<line key="l1" x1="18" y1="6" x2="6" y2="18"/>, <line key="l2" x1="6" y1="6" x2="18" y2="18"/>],
  check:  [<polyline key="p" points="20 6 9 17 4 12"/>],
};
const Ico = memo(({ n, s=18, c=PALETTE.textFaint }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {PATHS[n]}
  </svg>
));

/* ═══════════════════════════════════════════════════════
   SPARKLINE — memo'd, ResizeObserver, gradient fill
═══════════════════════════════════════════════════════ */
const Sparkline = memo(function Sparkline({ data, color=PALETTE.accent, h=48 }) {
  const ref = useRef(null);
  const [w, setW] = useState(300);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width || 300));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pts = useMemo(() => {
    if (!data?.length || data.length < 2) return "";
    const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
    return data.map((v,i) =>
      `${(i/(data.length-1))*w},${h-((v-min)/rng)*(h-6)-3}`
    ).join(" ");
  }, [data, w, h]);
  const gid = `spk_${color.replace(/[^a-z0-9]/gi,"")}`;
  return (
    <div ref={ref} style={{ width:"100%" }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.20"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {pts && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${gid})`}/>}
        {pts && <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>}
      </svg>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   WEEKLY BARS
═══════════════════════════════════════════════════════ */
const WeekBars = memo(function WeekBars({ data, days, today=5 }) {
  const max = useMemo(() => Math.max(...data, 1), [data]);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:52 }}>
      {data.map((v,i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ width:"100%", borderRadius:"3px 3px 0 0",
            height:`${Math.max((v/max)*42, v>0?3:0)}px`,
            background: i===today ? PALETTE.accent : v>0 ? PALETTE.borderMid : PALETTE.border,
            transition:`height ${K.ANIM_SLOW} ${K.EASE_OUT}` }}/>
          <span style={{ fontSize:9, color:i===today?PALETTE.accent:PALETTE.textFaint,
            fontFamily:"'EB Garamond',serif", letterSpacing:".04em" }}>{days[i]}</span>
        </div>
      ))}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   SHARE CARD — canvas, PCB branding
═══════════════════════════════════════════════════════ */
const ShareCard = memo(function ShareCard({ run, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !run) return;
    const cv = ref.current, ctx = cv.getContext("2d");
    cv.width = 600; cv.height = 340;
    const grad = ctx.createLinearGradient(0, 0, 600, 340);
    grad.addColorStop(0, "#211808"); grad.addColorStop(1, "#2C2010");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 600, 340);
    ctx.fillStyle = PALETTE.accent; ctx.fillRect(0, 0, 600, 5);
    // Subtle texture dots
    ctx.fillStyle = "rgba(255,255,255,0.015)";
    for (let i=0;i<80;i++) { const x=Math.random()*600,y=Math.random()*340; ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill(); }
    ctx.fillStyle = PALETTE.accentWarm; ctx.font = "bold 12px Georgia,serif";
    ctx.letterSpacing = "4px"; ctx.fillText("PACE CLUB BAKU", 30, 44);
    ctx.fillStyle = PALETTE.textMid; ctx.font = "10px Georgia,serif";
    ctx.letterSpacing = "1px"; ctx.fillText("paceclubbaku.az", 30, 60);
    ctx.fillStyle = "#F4EFE6"; ctx.font = "bold 20px Georgia,serif";
    ctx.letterSpacing = "0px"; ctx.fillText(run.trail || "My Run", 30, 98);
    ctx.fillStyle = PALETTE.accentWarm; ctx.font = "11px Georgia,serif"; ctx.fillText(run.date || "Today", 30, 116);
    ctx.fillStyle = PALETTE.accentWarm; ctx.font = "bold 68px Georgia,serif";
    ctx.fillText((run.distKm||0).toFixed(2), 30, 205);
    ctx.fillStyle = PALETTE.textMid; ctx.font = "16px Georgia,serif"; ctx.fillText("km", 32+(run.distKm>=10?60:0)+160, 205);
    const st = [
      ["PACE", Eng.fmtPace(run.pace)+"/km"], ["TIME", Eng.fmtTime(run.timeSec||0)],
      ["CALS", (run.cals||0)+" kcal"], ["STEPS", (run.steps||0).toLocaleString()],
      ["AVG HR", (run.hrAvg||0)+" bpm"], ["TRIMP", (run.load||0)+" pts"],
    ];
    st.forEach(([k,v],i) => {
      const x=30+(i%3)*190, y=i<3?248:290;
      ctx.fillStyle="#3A2A10"; ctx.font="8px Georgia,serif"; ctx.fillText(k, x, y);
      ctx.fillStyle="#F4EFE6"; ctx.font="bold 14px Georgia,serif"; ctx.fillText(v, x, y+14);
    });
    ctx.fillStyle = PALETTE.accent; ctx.font = "bold 38px Georgia,serif"; ctx.fillText("PCB", 518, 278);
  }, [run]);
  const dl = useCallback(() => {
    if (!ref.current) return;
    Object.assign(document.createElement("a"), {
      download:`PCB_run_${Date.now()}.png`, href:ref.current.toDataURL("image/png")
    }).click();
  }, []);
  return (
    <div className="overlay-bg" style={{ position:"fixed", inset:0, zIndex:500, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:400 }}>
        <canvas ref={ref} style={{ width:"100%", borderRadius:10, display:"block", boxShadow:"0 12px 60px rgba(0,0,0,.6)" }}/>
        <div style={{ display:"flex", gap:10, marginTop:12 }}>
          <button className="btn-primary" style={{ flex:1, fontSize:13 }} onClick={dl}>Download PNG</button>
          <button className="btn-ghost"   style={{ flex:1, fontSize:13 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   ALERT BANNER — priority-aware, animated
═══════════════════════════════════════════════════════ */
const AlertBanner = memo(function AlertBanner({ notif, onDismiss }) {
  const bg  = notif.priority===0 ? PALETTE.dangerBg : notif.priority===1 ? PALETTE.warnBg : PALETTE.infoBg;
  const col = notif.priority===0 ? PALETTE.danger   : notif.priority===1 ? PALETTE.warn   : PALETTE.info;
  const ic  = notif.priority<=1 ? "alert" : "bell";
  return (
    <div style={{ background:bg, border:`1px solid ${col}44`, borderRadius:10, padding:"10px 14px",
      display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10,
      animation:`slideDown ${K.ANIM_MED} ${K.EASE_OUT}` }}>
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <Ico n={ic} s={16} c={col}/>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:500, color:col }}>{notif.title}</div>
          {notif.body && <div style={{ fontSize:12, color:PALETTE.textMid, marginTop:2, lineHeight:1.4 }}>{notif.body}</div>}
        </div>
      </div>
      {!notif.persistent && (
        <button onClick={onDismiss} style={{ background:"none", border:"none", cursor:"pointer", padding:2, color:col }}>
          <Ico n="x" s={14} c={col}/>
        </button>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════
   [3] UNIFIED UPDATE LOOP HOOK
   Single rAF/interval master clock. Priority order:
     1. Physiology (HR, fatigue, pace)
     2. Geofence (safety zones)
     3. Notification dispatch
     4. State commit (batched)
═══════════════════════════════════════════════════════ */
function useUnifiedLoop({ active, paused, profile, rawKm, rawSec, rawCoords, zones, onPhysioUpdate }) {
  const physioRef  = useRef(Eng.physioInitial(profile.hrRest));
  const geoLastRef = useRef(new Map()); // zone.id → last alert ms
  const intervalRef= useRef(null);
  const secRef     = useRef(rawSec);
  const kmRef      = useRef(rawKm);
  secRef.current   = rawSec;
  kmRef.current    = rawKm;

  useEffect(() => {
    if (!active || paused) {
      // Passive recovery while not running
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (physioRef.current.fatigue > 0) {
        const recovery = setInterval(() => {
          physioRef.current = Eng.physioRest(physioRef.current);
        }, K.LOOP_MS);
        return () => clearInterval(recovery);
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const sec = secRef.current;
      const km  = kmRef.current;

      /* ── PRIORITY 1: PHYSIOLOGY ── */
      const rawPace  = Eng.pace(km, sec);
      const newPhys  = Eng.physioStep(
        physioRef.current,
        { paceMinKm: rawPace, elapsedSec: sec, gradePercent: 0 },
        profile
      );
      physioRef.current = newPhys;

      /* ── PRIORITY 2: HR ANOMALY ALERTS ── */
      const hrStatus = Eng.hrAlert(newPhys.hrSmooth, profile.hrMax, profile.hrRest);
      if (hrStatus === "critical") {
        NotifBus.push({ id:`hr_crit_${Math.floor(sec/30)}`, title:"⚠ Critical Heart Rate",
          body:`${newPhys.hrSmooth} bpm — ${Math.round(newPhys.hrSmooth/profile.hrMax*100)}% of max. Consider stopping.`,
          priority:0, persistent:true, type:"danger" });
        NotifBus.nativeNotify("Critical HR", `${newPhys.hrSmooth} bpm`, 0);
      } else if (hrStatus === "high") {
        NotifBus.push({ id:`hr_high_${Math.floor(sec/60)}`, title:"High Heart Rate",
          body:`${newPhys.hrSmooth} bpm — above 92% max. Ease pace.`, priority:1, type:"warn" });
      }

      /* ── PRIORITY 2: FATIGUE ALERT ── */
      if (newPhys.fatigue > 0.75 && sec > 300) {
        NotifBus.push({ id:`fatigue_${Math.floor(sec/120)}`, title:"Fatigue Detected",
          body:`Physiological fatigue at ${Math.round(newPhys.fatigue*100)}%. Pace degradation active.`,
          priority:1, type:"warn" });
      }

      /* ── PRIORITY 3: GEOFENCE ── */
      if (rawCoords?.length > 0) {
        const lastCoord = rawCoords[rawCoords.length - 1];
        for (const zone of zones) {
          const dist = Eng.haversineM(lastCoord, [zone.lat, zone.lon]);
          if (dist <= zone.radius * 1.1) {
            const lastAlert = geoLastRef.current.get(zone.id) || 0;
            if (Date.now() - lastAlert > K.GEO_ALERT_COOLDOWN_MS) {
              geoLastRef.current.set(zone.id, Date.now());
              const prio = zone.severity === "danger" ? 0 : zone.severity === "warn" ? 1 : 2;
              NotifBus.push({ id:`geo_${zone.id}_${Math.floor(Date.now()/K.GEO_ALERT_COOLDOWN_MS)}`,
                title: `${zone.severity === "danger" ? "⚠ Hazard" : "⚡ Alert"} — ${Math.round(dist)}m away`,
                body: zone.name, priority:prio, type:zone.severity });
              if (prio <= 1) NotifBus.nativeNotify(`PCB Alert: ${zone.name}`, `${Math.round(dist)}m away`, prio);
            }
          }
        }
      }

      /* ── PRIORITY 4: COMMIT TO UI ── */
      onPhysioUpdate({
        hr:      newPhys.hrSmooth,
        pace:    newPhys.paceSmooth,
        fatigue: newPhys.fatigue,
        effort:  newPhys.effort,
      });

    }, K.LOOP_MS);

    return () => clearInterval(intervalRef.current);
  }, [active, paused, profile, zones, onPhysioUpdate]);

  return physioRef;
}

/* ═══════════════════════════════════════════════════════
   GPS RAW DATA HOOK — isolated from physiology
═══════════════════════════════════════════════════════ */
function useGPS({ active, paused }) {
  const [rawCoords, setCoords] = useState([]);
  const [rawKm,     setKm]     = useState(0);
  const [rawSec,    setSec]    = useState(0);
  const geoWatchRef = useRef(null);
  const simRef      = useRef(null);
  const timerRef    = useRef(null);
  const pendingKm   = useRef(0);
  const pendingCoord= useRef(null);
  const rafRef      = useRef(null);

  // RAF flush — batches GPS state into React at animation rate
  const flush = useCallback(() => {
    let dirty = false;
    if (pendingKm.current > 0) {
      setKm(k => k + pendingKm.current);
      pendingKm.current = 0; dirty = true;
    }
    if (pendingCoord.current) {
      const c = pendingCoord.current; pendingCoord.current = null;
      setCoords(prev => {
        const next = [...prev, c];
        // Simplify coords when exceeding threshold to maintain map performance
        if (next.length > K.COORD_MAX) return Eng.rdp(next, K.GPS_SIMPLIFY_M / 111000);
        return next;
      });
      dirty = true;
    }
    rafRef.current = requestAnimationFrame(flush);
  }, []);

  useEffect(() => {
    if (!active) {
      clearInterval(timerRef.current); clearTimeout(simRef.current);
      cancelAnimationFrame(rafRef.current);
      if (typeof geoWatchRef.current === "number") navigator.geolocation.clearWatch(geoWatchRef.current);
      return;
    }
    if (paused) { clearInterval(timerRef.current); return; }

    // Timer
    timerRef.current = setInterval(() => setSec(s => s + 1), 1000);
    rafRef.current = requestAnimationFrame(flush);

    // GPS or simulation
    const trail = BAKU_TRAILS[0].coords;
    let step = 0;
    let lastCoord = trail[0];

    const simTick = () => {
      if (step >= trail.length - 1) return;
      const [la1,lo1] = trail[step], [la2,lo2] = trail[step+1];
      const seg = Eng.haversineM([la1,lo1],[la2,lo2]);
      if (seg >= K.GPS_MIN_DIST_M) {
        pendingKm.current += seg / 1000;
        pendingCoord.current = [la2, lo2];
        lastCoord = [la2, lo2];
      }
      step++;
      simRef.current = setTimeout(simTick, 3800);
    };

    if (navigator.geolocation) {
      geoWatchRef.current = navigator.geolocation.watchPosition(
        pos => {
          const c = [pos.coords.latitude, pos.coords.longitude];
          if (lastCoord) {
            const seg = Eng.haversineM(lastCoord, c);
            if (seg >= K.GPS_MIN_DIST_M && seg < 300) { // filter teleports
              pendingKm.current += seg / 1000;
              lastCoord = c;
            }
          } else { lastCoord = c; }
          pendingCoord.current = c;
        },
        () => simTick(),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
      );
    } else { simTick(); }

    return () => {
      clearInterval(timerRef.current); clearTimeout(simRef.current);
      cancelAnimationFrame(rafRef.current);
      if (typeof geoWatchRef.current === "number") navigator.geolocation.clearWatch(geoWatchRef.current);
    };
  }, [active, paused, flush]);

  const reset = useCallback(() => { setCoords([]); setKm(0); setSec(0); pendingKm.current = 0; pendingCoord.current = null; }, []);
  return { rawCoords, rawKm, rawSec, reset };
}

/* ═══════════════════════════════════════════════════════
   TRAIL RECORDER HOOK
═══════════════════════════════════════════════════════ */
function useTrailRecorder() {
  const [coords, setCoords] = useState([]);
  const [sec,    setSec]    = useState(0);
  const [phase,  setPhase]  = useState("idle"); // idle | recording | naming
  const timerRef = useRef(null);
  const geoRef   = useRef(null);
  const simRef   = useRef(null);
  const rafRef   = useRef(null);
  const pending  = useRef(null);

  const flush = useCallback(() => {
    if (pending.current) {
      const c = pending.current; pending.current = null;
      setCoords(p => {
        const n = [...p, c];
        return n.length > K.COORD_MAX ? Eng.rdp(n, K.GPS_SIMPLIFY_M/111000) : n;
      });
    }
    rafRef.current = requestAnimationFrame(flush);
  }, []);

  const start = useCallback(() => {
    setCoords([]); setSec(0); setPhase("recording");
    timerRef.current = setInterval(() => setSec(s => s+1), 1000);
    rafRef.current = requestAnimationFrame(flush);
    let lat=40.366+Math.random()*0.008, lon=49.837+Math.random()*0.008, s=0;
    setCoords([[lat,lon]]);
    const sim = () => {
      lat += 0.0009+Math.random()*0.0004; lon += 0.0007+Math.random()*0.0003;
      pending.current = [lat, lon]; s++;
      if (s < 24) simRef.current = setTimeout(sim, 2600);
    };
    if (navigator.geolocation) {
      geoRef.current = navigator.geolocation.watchPosition(
        pos => { pending.current = [pos.coords.latitude, pos.coords.longitude]; },
        () => sim(), { enableHighAccuracy:true, maximumAge:2000, timeout:5000 }
      );
    } else { sim(); }
  }, [flush]);

  const stop = useCallback(() => {
    clearInterval(timerRef.current); clearTimeout(simRef.current); cancelAnimationFrame(rafRef.current);
    if (typeof geoRef.current === "number") navigator.geolocation.clearWatch(geoRef.current);
    setPhase("naming");
  }, []);

  const reset = useCallback(() => { setPhase("idle"); setCoords([]); setSec(0); }, []);

  const distKm = useMemo(() => {
    if (coords.length < 2) return 0;
    let d = 0;
    for (let i = 1; i < coords.length; i++) d += Eng.haversineKm(coords[i-1], coords[i]);
    return parseFloat(d.toFixed(2));
  }, [coords.length]);

  useEffect(() => () => {
    clearInterval(timerRef.current); clearTimeout(simRef.current); cancelAnimationFrame(rafRef.current);
  }, []);

  return { coords, sec, phase, distKm, start, stop, reset };
}

/* ═══════════════════════════════════════════════════════
   CENTRAL APP STORE — useReducer for predictable state
═══════════════════════════════════════════════════════ */
const initialStore = {
  profile:  PROFILE_DEFAULT,
  runs:     [...SEED_RUNS],
  trails:   [...BAKU_TRAILS],
  posts:    [
    { id:"p1", user:"Nigar K.", initials:"NK", time:"2h ago", likes:8, liked:false,
      text:"Old City Loop in the rain — absolutely worth it. 4:52/km today.",
      run: processRunOnce({ id:"pr1", date:"Today", trail:"Old City Loop", trailAz:"Köhnə Şəhər", distKm:3.8, timeSec:1323, hrAvg:159 }) },
    { id:"p2", user:"Rashad A.", initials:"RA", time:"5h ago", likes:14, liked:false,
      text:"Highland Park: 120m elevation. The view makes every step worth it.", run:null },
  ],
  chat:     [...SEED_CHAT],
  settings: { showHR:true, showCadence:true, showLoad:true, showVO2:true, notifications:true, units:"metric", fearDogs:false, fearWildlife:false, alertRadius:150 },
  isPrem:   false,
  lang:     "en",
};

function storeReducer(state, action) {
  switch (action.type) {
    case "SET_PROFILE":    return { ...state, profile:{ ...state.profile, ...action.payload } };
    case "ADD_RUN":        return { ...state, runs:[action.payload, ...state.runs] };
    case "ADD_TRAIL":      return { ...state, trails:[action.payload, ...state.trails] };
    case "REPORT_TRAIL":   return { ...state, trails:state.trails.map(t => t.id===action.id ? {...t,reports:(t.reports||0)+1} : t) };
    case "PUBLISH_TRAIL":  return { ...state, trails:state.trails.map(t => t.id===action.id ? {...t,shared:true,isPersonal:false} : t) };
    case "ADD_POST":       return { ...state, posts:[action.payload, ...state.posts] };
    case "LIKE_POST":      return { ...state, posts:state.posts.map(p => p.id===action.id ? {...p,likes:p.liked?p.likes-1:p.likes+1,liked:!p.liked} : p) };
    case "ADD_CHAT":       return { ...state, chat:[...state.chat, action.payload] };
    case "LIKE_CHAT":      return { ...state, chat:state.chat.map(m => m.id===action.id ? {...m,likes:(m.likes||0)+1} : m) };
    case "SET_SETTINGS":   return { ...state, settings:{ ...state.settings, ...action.payload } };
    case "SET_PREM":       return { ...state, isPrem:action.payload };
    case "SET_LANG":       return { ...state, lang:action.payload };
    default:               return state;
  }
}

/* ═══════════════════════════════════════════════════════
   MEMOIZED SELECTORS — computed from store, never stored
═══════════════════════════════════════════════════════ */
function useSelectors(state) {
  const { runs, profile } = state;
  return useMemo(() => ({
    weekKm:     WEEKLY_KM.reduce((a,b) => a+b, 0),
    weekRuns:   WEEKLY_KM.filter(v => v>0).length,
    weekCals:   runs.slice(0,5).reduce((a,r) => a+(r.cals||0), 0),
    allTimeKm:  runs.reduce((a,r) => a+(r.distKm||0), 0),
    allSteps:   runs.reduce((a,r) => a+(r.steps||0), 0),
    allCals:    runs.reduce((a,r) => a+(r.cals||0), 0),
    allLoad:    runs.reduce((a,r) => a+(r.load||0), 0),
    bestPace:   runs.map(r => r.pace).filter(p => p&&isFinite(p)).reduce((a,b) => Math.min(a,b), Infinity) || null,
    longestRun: runs.reduce((a,r) => Math.max(a, r.distKm||0), 0),
    weekTrimp:  runs.slice(0,5).reduce((a,r) => a+(r.load||0), 0),
    vo2HR:      Eng.vo2HR(profile.hrMax, profile.hrRest),
  }), [runs, profile]);
}

/* ═══════════════════════════════════════════════════════
   GLOBAL CSS
═══════════════════════════════════════════════════════ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
::-webkit-scrollbar { width: 0; }

/* Motion system — all transitions share these tokens */
.slide  { animation: slideUp ${K.ANIM_MED} ${K.EASE_OUT} both; }
.fade   { animation: fadeIn  ${K.ANIM_FAST} ease both; }
.pop    { animation: popIn   ${K.ANIM_MED} ${K.EASE_SPRING} both; }
.pulse  { animation: pulse   2s ease-in-out infinite; }

@keyframes slideUp  { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
@keyframes popIn    { from { opacity:0; transform:scale(0.94) } to { opacity:1; transform:scale(1) } }
@keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.35} }
@keyframes slideDown{ from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) } }
@keyframes liveRing { 0%,100%{box-shadow:0 0 0 0 rgba(204,51,17,0.5)} 50%{box-shadow:0 0 0 8px rgba(204,51,17,0)} }

/* Buttons */
.btn-primary { background:${PALETTE.accent}; color:#FDFAF4; border:none; border-radius:8px; padding:13px 18px; font-family:'Playfair Display',serif; font-size:15px; font-weight:500; cursor:pointer; width:100%; transition:background ${K.ANIM_FAST} ${K.EASE_OUT}; letter-spacing:.02em; }
.btn-primary:hover { background:#6A4E0A; }
.btn-primary.stop  { background:${PALETTE.danger}; }
.btn-primary.stop:hover { background:#7A2010; }
.btn-ghost { background:transparent; color:${PALETTE.textMid}; border:1px solid ${PALETTE.border}; border-radius:8px; padding:11px 18px; font-family:'Playfair Display',serif; font-size:14px; cursor:pointer; width:100%; transition:border-color ${K.ANIM_FAST}, color ${K.ANIM_FAST}; }
.btn-ghost:hover  { border-color:${PALETTE.accent}; color:${PALETTE.accent}; }
.btn-ghost.active { border-color:${PALETTE.accent}; color:${PALETTE.accent}; background:${PALETTE.accentFaint}; }

/* Cards */
.card { background:${PALETTE.surface}; border:1px solid ${PALETTE.border}; border-radius:12px; padding:16px; }
.card-alt { background:${PALETTE.surfaceAlt}; border:1px solid ${PALETTE.border}; border-radius:12px; padding:16px; }

/* Nav */
.nav-btn { background:none; border:none; cursor:pointer; padding:8px 6px 4px; font-family:'EB Garamond',serif; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:${PALETTE.textFaint}; display:flex; flex-direction:column; align-items:center; gap:3px; transition:color ${K.ANIM_FAST}; min-width:44px; }
.nav-btn.active { color:${PALETTE.accent}; }

/* Inputs */
input, textarea { font-family:'EB Garamond',serif; font-size:14px; color:${PALETTE.text}; background:${PALETTE.bg}; border:1px solid ${PALETTE.border}; border-radius:8px; padding:10px 12px; width:100%; outline:none; transition:border-color ${K.ANIM_FAST}; }
input:focus, textarea:focus { border-color:${PALETTE.accent}; }
textarea { resize:none; line-height:1.65; }

/* Toggle */
.toggle { width:42px; height:24px; border-radius:12px; border:none; cursor:pointer; position:relative; transition:background ${K.ANIM_MED}; flex-shrink:0; }
.toggle::after { content:''; position:absolute; top:4px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left ${K.ANIM_MED} ${K.EASE_SPRING}; box-shadow:0 1px 4px rgba(0,0,0,.18); }
.toggle.on  { background:${PALETTE.accent}; }
.toggle.on::after  { left:22px; }
.toggle.off { background:${PALETTE.textFaint}; }
.toggle.off::after { left:4px; }

/* Shimmer */
.shim { background:linear-gradient(90deg,#EDE8E0 25%,#F5EFE0 50%,#EDE8E0 75%); background-size:200%; animation:shimmer 1.4s infinite; border-radius:6px; }
@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

/* Overlay */
.overlay-bg { background:${PALETTE.overlay}; backdrop-filter:blur(4px); animation:fadeIn ${K.ANIM_FAST} ease; }

/* Typography helpers */
.h1   { font-family:'Playfair Display',serif; font-weight:600; font-size:26px; color:${PALETTE.text}; line-height:1.1; }
.h2   { font-family:'Playfair Display',serif; font-weight:500; font-size:18px; color:${PALETTE.text}; }
.h3   { font-family:'Playfair Display',serif; font-weight:500; font-size:15px; color:${PALETTE.text}; }
.label{ font-family:'EB Garamond',serif; font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:${PALETTE.textFaint}; }
.body { font-family:'EB Garamond',serif; font-size:14px; color:${PALETTE.textMid}; line-height:1.65; }
.num  { font-family:'Playfair Display',serif; font-weight:600; color:${PALETTE.text}; }

/* Divider */
.dvd { border:none; border-top:1px solid ${PALETTE.border}; }

/* Live indicator */
.live-ring { animation:liveRing 1.8s ease-in-out infinite; border-radius:50%; }

/* Stat grid item */
.stat-cell { background:${PALETTE.surface}; border:1px solid ${PALETTE.border}; border-radius:10px; padding:12px 10px; }
.stat-val  { font-family:'Playfair Display',serif; font-weight:600; font-size:20px; color:${PALETTE.text}; line-height:1; }
.stat-unit { font-family:'EB Garamond',serif; font-size:11px; color:${PALETTE.textFaint}; margin-top:2px; text-transform:uppercase; letter-spacing:.06em; }

/* Pill */
.pill { display:inline-block; padding:2px 9px; border-radius:20px; font-family:'EB Garamond',serif; font-size:11px; letter-spacing:.03em; }
`;

/* ═══════════════════════════════════════════════════════
   APP ROOT
═══════════════════════════════════════════════════════ */
const NAV_ITEMS = [
  { id:"home",      l:"Home",     lAz:"Ana",       ic:"home"  },
  { id:"run",       l:"Run",      lAz:"Qaç",       ic:"run"   },
  { id:"trails",    l:"Trails",   lAz:"Marşrut",   ic:"map"   },
  { id:"community", l:"Club",     lAz:"Klüb",      ic:"users" },
  { id:"profile",   l:"Profile",  lAz:"Profil",    ic:"user"  },
  { id:"settings",  l:"Settings", lAz:"Parametr",  ic:"gear"  },
];

export default function PCBApp() {
  const [store, dispatch] = useReducer(storeReducer, initialStore);
  const sel = useSelectors(store);
  const isEn = store.lang === "en";

  /* UI state (screen/modal — not business logic) */
  const [screen,   setScreen]   = useState("home");
  const [subTab,   setSubTab]   = useState(null); // community sub-tabs
  const [mapFocus, setMapFocus] = useState(null); // trail id filter
  const [shareRun, setShareRun] = useState(null);
  const [aiOpen,   setAiOpen]   = useState(false);
  const [aiLoad,   setAiLoad]   = useState(false);
  const [aiText,   setAiText]   = useState("");
  const [reportObj,setReport]   = useState(null);
  const [reportIdx,setRIdx]     = useState(null);
  const [reportDone,setRDone]   = useState(false);
  const [editProf, setEditProf] = useState(false);
  const [editDraft,setEditDraft]= useState(store.profile);
  const [savedMsg, setSavedMsg] = useState(false);
  const [alerts,   setAlerts]   = useState([]);
  const chatEndRef = useRef(null);
  const [chatDraft,setChatDraft]= useState("");
  const [postDraft,setPostDraft]= useState("");
  const [inputErr, setInputErr] = useState(null);
  const [nearbyBanner,setNearby]= useState(null);
  const nearbyChecked = useRef(false);

  /* Run state */
  const [runActive, setRunActive] = useState(false);
  const [runPaused, setRunPaused] = useState(false);
  const [physioSnap, setPhysioSnap] = useState({ hr:store.profile.hrRest, pace:null, fatigue:0, effort:0 });

  const gps = useGPS({ active: runActive, paused: runPaused });

  const onPhysioUpdate = useCallback((snap) => setPhysioSnap(snap), []);

  /* Active zones (filter by user prefs) */
  const activeZones = useMemo(() => GEO_ZONES.filter(z => {
    if (z.type === "dogs"     && !store.settings.fearDogs)     return false;
    if (z.type === "wildlife" && !store.settings.fearWildlife) return false;
    return true;
  }), [store.settings.fearDogs, store.settings.fearWildlife]);

  useUnifiedLoop({
    active: runActive, paused: runPaused,
    profile: store.profile,
    rawKm: gps.rawKm, rawSec: gps.rawSec, rawCoords: gps.rawCoords,
    zones: activeZones, onPhysioUpdate,
  });

  /* Subscribe to notification bus */
  useEffect(() => {
    const unsub = NotifBus.subscribe(notif => {
      setAlerts(prev => {
        const exists = prev.find(a => a.id === notif.id);
        if (exists) return prev;
        return [notif, ...prev].slice(0, 4); // max 4 concurrent banners
      });
    });
    NotifBus.registerSW();
    return unsub;
  }, []);

  /* One-time nearby trail check */
  useEffect(() => {
    if (nearbyChecked.current || screen !== "trails") return;
    nearbyChecked.current = true;
    navigator.geolocation?.getCurrentPosition(pos => {
      const { latitude:lat, longitude:lon } = pos.coords;
      const close = store.trails.find(t => t.coords &&
        Eng.haversineM([lat,lon],[t.coords[0][0],t.coords[0][1]]) < (store.settings.alertRadius * 10));
      if (close) setNearby(close);
    }, () => {}, { enableHighAccuracy:false, timeout:4000 });
  }, [screen]);

  /* Memoized derived run stats (selectors not state) */
  const runDerived = useMemo(() => {
    const p = Eng.pace(gps.rawKm, gps.rawSec);
    return {
      pace:    physioSnap.pace || p,
      paceFmt: Eng.fmtPace(physioSnap.pace || p),
      timeFmt: Eng.fmtTime(gps.rawSec),
      cals:    Eng.calories(gps.rawKm, store.profile.weight),
      steps:   Eng.steps(gps.rawSec, p),
      cadence: Eng.cadence(p),
      vo2:     Eng.vo2Pace(p),
    };
  }, [gps.rawKm, gps.rawSec, physioSnap.pace, store.profile.weight]);

  /* Stable map props — memoized to prevent PCBMap re-renders */
  const trailsForMap = useMemo(() =>
    store.trails.filter(t => t.coords && (mapFocus ? t.id === mapFocus : true)),
    [store.trails, mapFocus]
  );
  const runTrailsForMap = useMemo(() => BAKU_TRAILS.slice(0,1), []);

  /* Run start/stop */
  const startRun = useCallback(() => {
    gps.reset(); setRunActive(true); setRunPaused(false);
    setPhysioSnap({ hr:store.profile.hrRest, pace:null, fatigue:0, effort:0 });
  }, [gps, store.profile.hrRest]);

  const stopRun = useCallback(() => {
    setRunActive(false); setRunPaused(false);
    if (gps.rawKm > 0.1) {
      const p = Eng.pace(gps.rawKm, gps.rawSec);
      const processed = processRunOnce({
        id:"r"+Date.now(), date:"Today",
        trail:"Bulvar Coastal Run", trailAz:"Bulvar Sahil",
        distKm:parseFloat(gps.rawKm.toFixed(2)),
        timeSec:gps.rawSec, hrAvg:physioSnap.hr,
      });
      dispatch({ type:"ADD_RUN", payload:processed });
    }
  }, [gps.rawKm, gps.rawSec, physioSnap.hr]);

  const togglePause = useCallback(() => setRunPaused(p => !p), []);

  /* Trail recorder */
  const rec = useTrailRecorder();
  const [recName, setRecName] = useState("");
  const [recDiff, setRecDiff] = useState("easy");
  const saveTrail = useCallback((shared) => {
    if (!recName.trim()) return;
    dispatch({ type:"ADD_TRAIL", payload:{
      id:"t"+Date.now(), name:recName, nameAz:recName,
      distKm:rec.distKm, diff:recDiff, elev:Math.round(20+Math.random()*80),
      rating:null, reports:0, shared, isPersonal:!shared,
      author:"Amir H.", authorId:"amir",
      coords:rec.coords.length>1?rec.coords:BAKU_TRAILS[0].coords,
    }});
    setRecName(""); setRecDiff("easy"); rec.reset();
  }, [recName, recDiff, rec]);

  /* Chat / post */
  const sendChat = useCallback(() => {
    if (!chatDraft.trim()) return;
    if (ProfFilter.has(chatDraft)) { setInputErr("chat"); setTimeout(()=>setInputErr(null),3000); return; }
    dispatch({ type:"ADD_CHAT", payload:{ id:"c"+Date.now(), user:"Amir H.", initials:"AH", time:"Just now", text:ProfFilter.clean(chatDraft), likes:0, isOwn:true } });
    setChatDraft(""); setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),80);
  }, [chatDraft]);

  const sendPost = useCallback(() => {
    if (!postDraft.trim()) return;
    if (ProfFilter.has(postDraft)) { setInputErr("post"); setTimeout(()=>setInputErr(null),3000); return; }
    dispatch({ type:"ADD_POST", payload:{ id:"p"+Date.now(), user:"Amir H.", initials:"AH", time:"Just now", text:ProfFilter.clean(postDraft), likes:0, liked:false, run:store.runs[0]||null } });
    setPostDraft("");
  }, [postDraft, store.runs]);

  /* AI */
  const fetchAI = useCallback(async () => {
    if (!store.isPrem) { setAiOpen(true); return; }
    setAiOpen(true); setAiLoad(true); setAiText("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000,
          messages:[{ role:"user", content:
            `You are a professional running coach for Pace Club Baku (PCB), Azerbaijan.
Runner: ${store.profile.name} | ${store.profile.weight}kg | Age ${store.profile.age}
Weekly: ${sel.weekKm.toFixed(1)}km, ${sel.weekRuns} sessions | Weekly TRIMP: ${sel.weekTrimp} pts
VO₂max: ${sel.vo2HR} ml/kg/min | HR rest: ${store.profile.hrRest} / max: ${store.profile.hrMax}
Best pace: ${Eng.fmtPace(sel.bestPace)}/km | Longest: ${sel.longestRun.toFixed(1)}km
Write 3 paragraphs: (1) honest performance analysis with specific numbers, (2) one evidence-based recommendation citing exercise physiology (polarised training, Maffetone MAF, cardiac drift, TRIMP accumulation), (3) next week's concrete targets. WSJ tone. Under 150 words.` }]
        })
      });
      const d = await res.json();
      setAiText(d.content?.[0]?.text || "Analysis unavailable.");
    } catch { setAiText("Connection error."); }
    setAiLoad(false);
  }, [store.isPrem, store.profile, sel]);

  /* ── RENDER ── */
  return (
    <div style={{ fontFamily:"'EB Garamond',serif", background:PALETTE.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto", color:PALETTE.text, paddingBottom:80 }}>
      <style>{CSS}</style>

      {/* STATUS BAR */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 20px 10px", borderBottom:`1px solid ${PALETTE.border}` }}>
        <span style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:13, color:PALETTE.accent, letterSpacing:".06em" }}>PACE CLUB BAKU</span>
        <div style={{ display:"flex", gap:12, alignItems:"center" }}>
          <span onClick={()=>dispatch({type:"SET_PREM",payload:!store.isPrem})} style={{ cursor:"pointer", fontSize:11, color:store.isPrem?PALETTE.accent:PALETTE.textFaint, borderBottom:`1px solid ${store.isPrem?PALETTE.accent:PALETTE.textFaint}`, paddingBottom:1, letterSpacing:".08em" }}>
            {store.isPrem?"PREMIUM ✦":"FREE"}
          </span>
          <span onClick={()=>dispatch({type:"SET_LANG",payload:isEn?"az":"en"})} style={{ cursor:"pointer", fontSize:11, color:PALETTE.textMid, letterSpacing:".08em" }}>{isEn?"AZ":"EN"}</span>
        </div>
      </div>

      {/* GLOBAL ALERT BANNERS */}
      {alerts.length > 0 && (
        <div style={{ padding:"8px 16px 0", display:"flex", flexDirection:"column", gap:6 }}>
          {alerts.map(a => (
            <AlertBanner key={a.id} notif={a} onDismiss={()=>setAlerts(prev=>prev.filter(x=>x.id!==a.id))}/>
          ))}
        </div>
      )}

      {/* ══ HOME ══ */}
      {screen==="home" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          <div style={{ marginBottom:22 }}>
            <div className="label" style={{ marginBottom:4 }}>{isEn?"Good morning":"Sabahınız xeyir"}</div>
            <div className="h1">{isEn?store.profile.name:store.profile.nameAz}</div>
            <div style={{ fontSize:14, color:PALETTE.textMid, fontStyle:"italic", marginTop:4 }}>{isEn?"The runner's companion for Baku.":"Bakı qaçıcıları üçün tərəfdaş."}</div>
          </div>

          <div className="card" style={{ marginBottom:14 }}>
            <div className="label" style={{ marginBottom:12 }}>{isEn?"This week":"Bu həftə"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px 20px", marginBottom:16 }}>
              {[
                { k:isEn?"Distance":"Məsafə",   v:sel.weekKm.toFixed(1), u:"km" },
                { k:isEn?"Runs":"Qaçışlar",      v:sel.weekRuns,          u:"sessions" },
                { k:isEn?"Avg Pace":"Ort. Temp", v:Eng.fmtPace(5.42),    u:"/km" },
                { k:isEn?"Streak":"Seriya",       v:"9",                   u:`${isEn?"days":"gün"} 🔥` },
              ].map(s => (
                <div key={s.k}>
                  <div className="num" style={{ fontSize:26 }}>{s.v}<span style={{ fontSize:13, fontWeight:400, color:PALETTE.textMid, fontFamily:"'EB Garamond',serif" }}> {s.u}</span></div>
                  <div className="stat-unit">{s.k}</div>
                </div>
              ))}
            </div>
            <WeekBars data={WEEKLY_KM} days={DAYS[store.lang]} today={5}/>
            <div style={{ fontSize:12, color:PALETTE.textFaint, marginTop:8, textAlign:"right", fontStyle:"italic" }}>{sel.weekCals.toLocaleString()} kcal this week</div>
          </div>

          {/* AI card */}
          <div className="card" onClick={fetchAI} style={{ marginBottom:14, cursor:"pointer", borderColor:store.isPrem?PALETTE.accentWarm:PALETTE.border }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div className="h3" style={{ marginBottom:3 }}>{isEn?"AI Coach Analysis":"AI Məşqçi"}</div>
                <div style={{ fontSize:13, color:PALETTE.textMid, fontStyle:"italic" }}>{store.isPrem?"Weekly analysis ready →":(isEn?"Available with Premium":"Premium ilə")}</div>
              </div>
              <span style={{ fontSize:22, color:store.isPrem?PALETTE.accent:PALETTE.textFaint }}>◎</span>
            </div>
          </div>

          <div className="label" style={{ marginBottom:12 }}>{isEn?"Recent Activity":"Son Fəaliyyət"}</div>
          {store.runs.slice(0,3).map((r,i) => (
            <div key={r.id||i} className="card" style={{ marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between" }}>
                <div style={{ flex:1, paddingRight:12 }}>
                  <div className="h3" style={{ marginBottom:3 }}>{isEn?r.trail:r.trailAz}</div>
                  <div className="body">{r.timeFmt} · {r.paceFmt}/km · {r.cals} kcal · {(r.steps||0).toLocaleString()} steps</div>
                  <div style={{ fontSize:11, color:PALETTE.textFaint, marginTop:2 }}>{r.date}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div className="num" style={{ fontSize:22, color:PALETTE.accent }}>{r.distKm?.toFixed(2)}</div>
                  <div className="stat-unit">km</div>
                  <button onClick={e=>{e.stopPropagation();setShareRun(r);}} style={{ marginTop:6, background:"none", border:`1px solid ${PALETTE.border}`, borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:11, color:PALETTE.textMid, fontFamily:"'EB Garamond',serif" }}>Share</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ RUN ══ */}
      {screen==="run" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
            <div className="h1">{runActive?(isEn?"Active Run":"Aktiv Qaçış"):(isEn?"Begin Run":"Qaçışa Başla")}</div>
            {runActive && !runPaused && <div className="live-ring" style={{ width:10, height:10, background:PALETTE.liveRed, borderRadius:"50%", flexShrink:0 }}/>}
          </div>

          <PCBMap trailObjs={runActive?runTrailsForMap:BAKU_TRAILS} runCoords={runActive?gps.rawCoords:null} recCoords={null} zones={activeZones} height={210}/>

          {/* Primary metrics */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, margin:"12px 0" }}>
            {[
              { k:isEn?"Distance":"Məsafə", v:gps.rawKm.toFixed(2), u:"km" },
              { k:isEn?"Time":"Vaxt",        v:runDerived.timeFmt,    u:"" },
              { k:isEn?"Pace":"Temp",         v:runDerived.paceFmt,   u:"/km" },
            ].map(s => (
              <div key={s.k} className="stat-cell" style={{ textAlign:"center" }}>
                <div className="stat-val">{s.v}</div>
                <div className="stat-unit">{s.u||s.k}</div>
              </div>
            ))}
          </div>

          {/* Secondary metrics */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            {[
              store.settings.showHR      && { k:isEn?"Heart Rate":"Ürək Ritmi", v:runActive?physioSnap.hr:"–",                                    u:"bpm", accent:physioSnap.hr>store.profile.hrMax*0.9?PALETTE.danger:PALETTE.text },
              { k:isEn?"Calories":"Kalori",                                         v:runDerived.cals||"–",                                           u:"kcal" },
              store.settings.showCadence && { k:isEn?"Cadence":"Kadens",           v:runActive?runDerived.cadence:"–",                               u:"spm" },
              store.settings.showLoad    && { k:"TRIMP",                            v:runActive?Eng.trimp(gps.rawSec/60,physioSnap.hr,store.profile.hrRest,store.profile.hrMax):"–", u:"pts" },
              { k:isEn?"Steps":"Addımlar",                                           v:runActive?runDerived.steps.toLocaleString():"–",                u:"" },
              store.settings.showVO2     && { k:"VO₂max",                           v:runActive?(runDerived.vo2||"–"):"–",                            u:"ml/kg/min" },
            ].filter(Boolean).map(s => (
              <div key={s.k} className="stat-cell">
                <div className="stat-val" style={{ fontSize:18, color:s.accent||PALETTE.text }}>{s.v} <span style={{ fontSize:11, color:PALETTE.textFaint, fontWeight:400, fontFamily:"'EB Garamond',serif" }}>{s.u}</span></div>
                <div className="stat-unit">{s.k}</div>
              </div>
            ))}
          </div>

          {/* Fatigue bar */}
          {runActive && physioSnap.fatigue > 0.1 && (
            <div style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:PALETTE.textFaint, marginBottom:4 }}>
                <span className="label" style={{ marginBottom:0 }}>Physiological fatigue</span>
                <span style={{ fontFamily:"'Playfair Display',serif", fontSize:11, fontWeight:500, color:physioSnap.fatigue>0.7?PALETTE.danger:PALETTE.accentWarm }}>{Math.round(physioSnap.fatigue*100)}%</span>
              </div>
              <div style={{ height:4, background:PALETTE.border, borderRadius:2 }}>
                <div style={{ height:"100%", borderRadius:2, transition:`width ${K.ANIM_MED} ${K.EASE_OUT}`,
                  width:`${physioSnap.fatigue*100}%`,
                  background:physioSnap.fatigue>0.7?PALETTE.danger:physioSnap.fatigue>0.4?PALETTE.warn:PALETTE.accentWarm }}/>
              </div>
              {physioSnap.fatigue > 0.05 && (
                <div style={{ fontSize:11, color:PALETTE.textFaint, marginTop:3, fontStyle:"italic" }}>
                  Pace degraded ~{(physioSnap.fatigue*8).toFixed(1)}% · HR drift active
                </div>
              )}
            </div>
          )}

          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <button className={`btn-primary${runActive?" stop":""}`} style={{ flex:2 }} onClick={runActive?stopRun:startRun}>
              {runActive?(isEn?"End Run":"Bitir"):(isEn?"Begin Run":"Başla")}
            </button>
            {runActive && <button className="btn-ghost" style={{ flex:1 }} onClick={togglePause}>{runPaused?(isEn?"Resume":"Davam"):(isEn?"Pause":"Fasilə")}</button>}
          </div>

          {/* Post-run summary */}
          {gps.rawKm > 0.05 && !runActive && (
            <div className="card" style={{ borderColor:PALETTE.accentWarm, marginBottom:14, animation:`popIn ${K.ANIM_MED} ${K.EASE_SPRING}` }}>
              <div className="h2" style={{ fontStyle:"italic", marginBottom:12 }}>{isEn?"Run Summary":"Qaçış Xülasəsi"}</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px 16px" }}>
                {[
                  { k:"Distance",      v:`${gps.rawKm.toFixed(2)} km` },
                  { k:"Duration",      v:Eng.fmtTime(gps.rawSec) },
                  { k:"Avg. Pace",     v:`${runDerived.paceFmt}/km` },
                  { k:"Calories",      v:`${runDerived.cals} kcal` },
                  { k:"Steps",         v:runDerived.steps.toLocaleString() },
                  { k:"Cadence",       v:`${runDerived.cadence} spm` },
                  { k:"TRIMP Load",    v:`${Eng.trimp(gps.rawSec/60,physioSnap.hr,store.profile.hrRest,store.profile.hrMax)} pts` },
                  store.settings.showVO2&&{ k:"VO₂max est.", v:`${runDerived.vo2} ml/kg/min` },
                ].filter(Boolean).map(({k,v}) => (
                  <div key={k}>
                    <div className="label" style={{ marginBottom:2 }}>{k}</div>
                    <div className="h3">{v}</div>
                  </div>
                ))}
              </div>
              <button className="btn-ghost" style={{ marginTop:14, fontSize:13 }} onClick={()=>setShareRun(store.runs[0])}>Share this run</button>
            </div>
          )}
        </div>
      )}

      {/* ══ TRAILS ══ */}
      {screen==="trails" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          <div className="h1" style={{ marginBottom:2 }}>{isEn?"Baku Routes":"Bakı Marşrutları"}</div>
          <div className="body" style={{ marginBottom:14 }}>{store.trails.filter(t=>t.shared).length} routes · Record your own</div>

          {nearbyBanner && (
            <div style={{ background:PALETTE.successBg, border:`1px solid ${PALETTE.success}44`, borderRadius:10, padding:"10px 14px", marginBottom:12, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div className="label" style={{ color:PALETTE.success, marginBottom:2 }}>Nearby</div>
                <div className="h3">{nearbyBanner.name} — {nearbyBanner.distKm}km</div>
              </div>
              <button className="btn-primary" style={{ width:"auto", padding:"7px 14px", fontSize:12 }} onClick={()=>setScreen("run")}>Run it</button>
            </div>
          )}

          <PCBMap trailObjs={trailsForMap} runCoords={null} recCoords={rec.phase==="recording"?rec.coords:null} zones={activeZones} height={200}/>

          <div style={{ display:"flex", gap:6, margin:"8px 0 14px", flexWrap:"wrap" }}>
            <button className={`btn-ghost${!mapFocus?" active":""}`} style={{ width:"auto", fontSize:11, padding:"5px 10px" }} onClick={()=>setMapFocus(null)}>All</button>
            {store.trails.filter(t=>t.coords).map(tr => (
              <button key={tr.id} className={`btn-ghost${mapFocus===tr.id?" active":""}`} style={{ width:"auto", fontSize:11, padding:"5px 10px" }} onClick={()=>setMapFocus(mapFocus===tr.id?null:tr.id)}>
                {(isEn?tr.name:tr.nameAz).split(" ")[0]}
              </button>
            ))}
          </div>

          {/* Trail recorder */}
          <div className="card" style={{ marginBottom:14, borderColor:rec.phase==="recording"?PALETTE.danger:rec.phase==="naming"?PALETTE.success:PALETTE.border }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:rec.phase!=="idle"?12:0 }}>
              <div>
                <div className="h3">{isEn?"Record New Trail":"Yeni Marşrut Yaz"}</div>
                {rec.phase==="recording" && <div className="pulse" style={{ fontSize:12, color:PALETTE.liveRed, marginTop:2 }}>● {Eng.fmtTime(rec.sec)} · {rec.coords.length} pts · {rec.distKm.toFixed(2)}km</div>}
              </div>
              {rec.phase==="idle"      && <button className="btn-primary" style={{ width:"auto", padding:"8px 14px", fontSize:13 }} onClick={rec.start}>Record</button>}
              {rec.phase==="recording" && <button className="btn-primary stop" style={{ width:"auto", padding:"8px 14px", fontSize:13 }} onClick={rec.stop}>Stop</button>}
            </div>
            {rec.phase==="naming" && (
              <div>
                <input value={recName} onChange={e=>setRecName(e.target.value)} placeholder="Trail name…" style={{ marginBottom:10 }}/>
                <div style={{ display:"flex", gap:6, marginBottom:12 }}>
                  {[["easy",PALETTE.success,"#EBF2E6"],["moderate",PALETTE.accent,"#F5ECDA"],["hard",PALETTE.danger,"#F9E6DE"]].map(([d,col,bg]) => (
                    <button key={d} onClick={()=>setRecDiff(d)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:`1px solid ${recDiff===d?col:PALETTE.border}`, background:recDiff===d?bg:"transparent", color:recDiff===d?col:PALETTE.textMid, fontFamily:"'EB Garamond',serif", fontSize:13, cursor:"pointer", textTransform:"capitalize" }}>{d}</button>
                  ))}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button className="btn-ghost" style={{ flex:1, fontSize:13 }} onClick={()=>saveTrail(false)}>🔒 Private</button>
                  <button className="btn-primary" style={{ flex:1, fontSize:13 }} onClick={()=>saveTrail(true)}>🌐 Share</button>
                </div>
              </div>
            )}
          </div>

          {/* Trail list */}
          {store.trails.map(trail => (
            <div key={trail.id} className="card" style={{ marginBottom:10, borderLeft:`3px solid ${trail.isPersonal?PALETTE.success:trail.diff==="hard"?PALETTE.danger:PALETTE.accent}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div style={{ flex:1, paddingRight:10 }}>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center", marginBottom:5 }}>
                    <div className="h3">{isEn?trail.name:trail.nameAz}</div>
                    {trail.isPersonal && <span className="pill" style={{ background:PALETTE.successBg, color:PALETTE.success }}>Personal</span>}
                    {trail.shared && !trail.isPersonal && trail.authorId!=="pcb" && <span className="pill" style={{ background:PALETTE.successBg, color:PALETTE.success }}>Community</span>}
                  </div>
                  <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                    <span className="pill" style={{ background:trail.diff==="easy"?"#EBF2E6":trail.diff==="moderate"?"#F5ECDA":"#F9E6DE", color:trail.diff==="easy"?PALETTE.success:trail.diff==="moderate"?PALETTE.accent:PALETTE.danger }}>{trail.diff.charAt(0).toUpperCase()+trail.diff.slice(1)}</span>
                    {trail.reports>0 && <span className="pill" style={{ background:PALETTE.dangerBg, color:PALETTE.danger }}>⚠ {trail.reports}</span>}
                  </div>
                  <div style={{ fontSize:11, color:PALETTE.textFaint, marginTop:5 }}>by {trail.author} · {trail.elev}m elevation</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div className="num" style={{ fontSize:22, color:PALETTE.accent }}>{typeof trail.distKm==="number"?trail.distKm.toFixed(2):trail.distKm}</div>
                  <div className="stat-unit">km</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button className="btn-ghost" style={{ width:"auto", fontSize:12, padding:"6px 10px" }} onClick={()=>{setReport(trail);setRIdx(null);setRDone(false);}}>⚠ Report</button>
                {trail.isPersonal && <button className="btn-primary" style={{ width:"auto", fontSize:12, padding:"6px 10px" }} onClick={()=>dispatch({type:"PUBLISH_TRAIL",id:trail.id})}>Share publicly</button>}
                <button className="btn-primary" style={{ width:"auto", fontSize:12, padding:"6px 12px" }} onClick={()=>{setMapFocus(trail.id);setScreen("run");}}>▶ Run</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ COMMUNITY ══ */}
      {screen==="community" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          <div className="h1" style={{ marginBottom:14 }}>Club</div>
          <div style={{ display:"flex", borderBottom:`1px solid ${PALETTE.border}`, marginBottom:16 }}>
            {["leaderboard","feed","chat"].map(s => (
              <button key={s} onClick={()=>setSubTab(s==="leaderboard"?null:s)} style={{ flex:1, background:"none", border:"none", padding:"8px 0", fontFamily:"'Playfair Display',serif", fontSize:13, cursor:"pointer", color:(subTab===s||(s==="leaderboard"&&!subTab))?PALETTE.accent:PALETTE.textFaint, borderBottom:`2px solid ${(subTab===s||(s==="leaderboard"&&!subTab))?PALETTE.accent:"transparent"}`, transition:`all ${K.ANIM_FAST}`, textTransform:"capitalize" }}>{s}</button>
            ))}
          </div>

          {!subTab && (
            <>
              <div className="card" style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"center", alignItems:"flex-end", gap:16, padding:"8px 0 14px" }}>
                  {[LEADERBOARD[1],LEADERBOARD[0],LEADERBOARD[2]].map((r,i) => {
                    const hs=[68,92,56];
                    return (
                      <div key={r.rank} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <div style={{ fontSize:12, color:PALETTE.textMid, fontStyle:"italic" }}>{r.km}km</div>
                        <div style={{ width:40,height:40,borderRadius:"50%",background:PALETTE.bg,border:`2px solid ${PALETTE.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:13,fontWeight:700,color:PALETTE.text }}>{r.initials}</div>
                        <div style={{ background:i===1?PALETTE.accent:PALETTE.border,width:46,height:hs[i],borderRadius:"6px 6px 0 0",display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:8 }}>
                          <span style={{ fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:i===1?"#FDFAF4":PALETTE.textMid }}>#{r.rank}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {LEADERBOARD.map(r => (
                <div key={r.rank} className="card" style={{ marginBottom:8,display:"flex",alignItems:"center",gap:10,background:r.isUser?"#FDFAF0":PALETTE.surface,borderColor:r.isUser?PALETTE.accentWarm:PALETTE.border }}>
                  <div style={{ fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:700,color:r.rank<=3?PALETTE.accent:PALETTE.textFaint,width:26,flexShrink:0 }}>#{r.rank}</div>
                  <div style={{ width:36,height:36,borderRadius:"50%",background:PALETTE.bg,border:`1px solid ${PALETTE.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:12,fontWeight:700,color:PALETTE.text,flexShrink:0 }}>{r.initials}</div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div className="h3">{isEn?r.name:r.nameAz}{r.isUser&&<span style={{ fontSize:11,color:PALETTE.accent,fontStyle:"italic" }}> — you</span>}</div>
                    <div className="body">{Eng.fmtPace(r.avgPace)}/km · 🔥{r.streak}d · {r.runs} runs</div>
                  </div>
                  <div style={{ textAlign:"right",flexShrink:0 }}>
                    <div className="num" style={{ fontSize:20,color:PALETTE.accent }}>{r.km}</div>
                    <div className="stat-unit">km</div>
                  </div>
                </div>
              ))}
            </>
          )}

          {subTab==="feed" && (
            <div>
              <div className="card" style={{ marginBottom:14 }}>
                <textarea value={postDraft} onChange={e=>setPostDraft(e.target.value)} placeholder="Share your run or thoughts…" rows={3} className={inputErr==="post"?"err":""}/>
                {inputErr==="post" && <div style={{ fontSize:12,color:PALETTE.danger,marginTop:4 }}>Please keep language respectful.</div>}
                <button className="btn-primary" style={{ marginTop:10,fontSize:13 }} onClick={sendPost}>Post to club</button>
              </div>
              {store.posts.map(p => (
                <div key={p.id} className="card" style={{ marginBottom:12 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
                    <div style={{ width:34,height:34,borderRadius:"50%",background:PALETTE.accentFaint,border:`1px solid ${PALETTE.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:12,fontWeight:700,color:PALETTE.accent,flexShrink:0 }}>{p.initials}</div>
                    <div>
                      <div className="h3" style={{ fontSize:14 }}>{p.user}</div>
                      <div style={{ fontSize:11,color:PALETTE.textFaint }}>{p.time}</div>
                    </div>
                  </div>
                  <div className="body" style={{ marginBottom:10 }}>{p.text}</div>
                  {p.run && (
                    <div style={{ background:PALETTE.bg,borderRadius:8,padding:"10px 12px",marginBottom:10,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6 }}>
                      {[{k:"Distance",v:`${p.run.distKm}km`},{k:"Pace",v:`${Eng.fmtPace(p.run.pace)}/km`},{k:"Calories",v:`${p.run.cals}kcal`}].map(({k,v}) => (
                        <div key={k} style={{ textAlign:"center" }}>
                          <div className="num" style={{ fontSize:14,color:PALETTE.accent }}>{v}</div>
                          <div className="stat-unit">{k}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display:"flex",gap:14,alignItems:"center" }}>
                    <button onClick={()=>dispatch({type:"LIKE_POST",id:p.id})} style={{ background:"none",border:"none",cursor:"pointer",fontSize:13,color:p.liked?PALETTE.danger:PALETTE.textFaint,fontFamily:"'EB Garamond',serif",display:"flex",alignItems:"center",gap:5 }}>
                      <Ico n="heart" s={13} c={p.liked?PALETTE.danger:PALETTE.textFaint}/>{p.likes}
                    </button>
                    {p.run && <button onClick={()=>setShareRun(p.run)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:13,color:PALETTE.textMid,fontFamily:"'EB Garamond',serif",display:"flex",alignItems:"center",gap:5 }}><Ico n="share" s={13} c={PALETTE.textMid}/>Share</button>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {subTab==="chat" && (
            <div>
              <div style={{ background:PALETTE.surfaceAlt,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:PALETTE.textMid,fontStyle:"italic" }}>Profanity filtered automatically. Be respectful.</div>
              <div style={{ maxHeight:340,overflowY:"auto",marginBottom:12 }}>
                {store.chat.map(m => (
                  <div key={m.id} style={{ marginBottom:12,display:"flex",gap:8,alignItems:"flex-start",flexDirection:m.isOwn?"row-reverse":"row" }}>
                    <div style={{ width:28,height:28,borderRadius:"50%",background:m.isOwn?PALETTE.accentFaint:PALETTE.bg,border:`1px solid ${PALETTE.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:10,fontWeight:700,color:PALETTE.accent,flexShrink:0 }}>{m.initials}</div>
                    <div style={{ maxWidth:"76%" }}>
                      <div style={{ fontSize:11,color:PALETTE.textFaint,marginBottom:2,textAlign:m.isOwn?"right":"left" }}>{m.user} · {m.time}</div>
                      <div style={{ background:m.isOwn?PALETTE.accentFaint:PALETTE.surface,border:`1px solid ${m.isOwn?PALETTE.accentWarm:PALETTE.border}`,borderRadius:m.isOwn?"10px 10px 2px 10px":"10px 10px 10px 2px",padding:"8px 12px",fontSize:14,lineHeight:1.5 }}>{m.text}</div>
                      <button onClick={()=>dispatch({type:"LIKE_CHAT",id:m.id})} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:PALETTE.textFaint,fontFamily:"'EB Garamond',serif",marginTop:3,display:"block",textAlign:m.isOwn?"right":"left",width:"100%" }}>♥ {m.likes}</button>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef}/>
              </div>
              {inputErr==="chat" && <div style={{ fontSize:12,color:PALETTE.danger,marginBottom:6,fontStyle:"italic" }}>⚠ Blocked: please keep language respectful.</div>}
              <div style={{ display:"flex",gap:8 }}>
                <input value={chatDraft} onChange={e=>setChatDraft(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Message the club…" style={{ flex:1 }}/>
                <button className="btn-primary" style={{ width:"auto",padding:"10px 14px" }} onClick={sendChat}><Ico n="send" s={14} c="#FDFAF4"/></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PROFILE ══ */}
      {screen==="profile" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          {!editProf ? (
            <>
              <div style={{ display:"flex",gap:14,alignItems:"center",marginBottom:20 }}>
                <div style={{ width:60,height:60,borderRadius:"50%",background:PALETTE.accentFaint,border:`2px solid ${PALETTE.accentWarm}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:700,color:PALETTE.accent,flexShrink:0 }}>AH</div>
                <div style={{ flex:1 }}>
                  <div className="h1" style={{ fontSize:22 }}>{isEn?store.profile.name:store.profile.nameAz}</div>
                  <div style={{ fontSize:13,color:PALETTE.textMid,fontStyle:"italic" }}>{store.isPrem?"Premium ✦":"Free"} · Baku</div>
                </div>
                <button onClick={()=>{setEditDraft({...store.profile});setEditProf(true);}} style={{ background:"none",border:`1px solid ${PALETTE.border}`,borderRadius:8,padding:"7px 10px",cursor:"pointer" }}><Ico n="edit" s={15} c={PALETTE.textMid}/></button>
              </div>

              <div className="label" style={{ marginBottom:12 }}>All-Time Statistics</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }}>
                {[
                  { k:"Total Distance",   v:sel.allTimeKm.toFixed(1),     u:"km" },
                  { k:"Total Runs",        v:store.runs.length,             u:"sessions" },
                  { k:"Total Steps",       v:sel.allSteps.toLocaleString(), u:"steps" },
                  { k:"Total Calories",    v:sel.allCals.toLocaleString(),  u:"kcal" },
                  { k:"Best Pace",         v:Eng.fmtPace(sel.bestPace),    u:"/km" },
                  { k:"Longest Run",       v:sel.longestRun.toFixed(1),    u:"km" },
                  store.settings.showVO2&&{ k:"Est. VO₂max",v:sel.vo2HR,   u:"ml/kg/min" },
                  store.settings.showLoad&&{ k:"Avg TRIMP",  v:store.runs.length?Math.round(sel.allLoad/store.runs.length):0, u:"pts/session" },
                ].filter(Boolean).map(s => (
                  <div key={s.k} className="stat-cell">
                    <div className="num" style={{ fontSize:22 }}>{s.v}</div>
                    <div style={{ fontSize:11,color:PALETTE.textMid,marginTop:1 }}>{s.u}</div>
                    <div className="stat-unit" style={{ marginTop:2 }}>{s.k}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom:14 }}>
                <div className="label" style={{ marginBottom:8 }}>Pace Trend</div>
                <Sparkline data={PACE_HIST} color={PALETTE.accent} h={48}/>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:PALETTE.textFaint,marginTop:4 }}>
                  <span>8 runs ago: {Eng.fmtPace(PACE_HIST[0])}/km</span>
                  <span style={{ color:PALETTE.success }}>↑ Today: {Eng.fmtPace(PACE_HIST[PACE_HIST.length-1])}/km</span>
                </div>
              </div>

              <div className="label" style={{ marginBottom:12 }}>Run History</div>
              {store.runs.map((r,i) => (
                <div key={r.id||i} className="card" style={{ marginBottom:8 }}>
                  <div style={{ display:"flex",justifyContent:"space-between" }}>
                    <div style={{ flex:1 }}>
                      <div className="h3">{isEn?r.trail:r.trailAz}</div>
                      <div className="body">{r.timeFmt} · {r.paceFmt}/km · {(r.steps||0).toLocaleString()} steps · {r.cals} kcal</div>
                      <div style={{ fontSize:11,color:PALETTE.textFaint }}>{r.date} · TRIMP {r.load} · VO₂ {r.vo2}</div>
                    </div>
                    <div style={{ textAlign:"right",flexShrink:0 }}>
                      <div className="num" style={{ fontSize:20,color:PALETTE.accent }}>{typeof r.distKm==="number"?r.distKm.toFixed(2):r.distKm}</div>
                      <div className="stat-unit">km</div>
                      <button onClick={()=>setShareRun(r)} style={{ marginTop:5,background:"none",border:`1px solid ${PALETTE.border}`,borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:11,color:PALETTE.textMid,fontFamily:"'EB Garamond',serif" }}>Share</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <div>
              <div className="h1" style={{ marginBottom:16 }}>Edit Profile</div>
              {[
                { k:"name",   l:"Name (EN)",            type:"text"   },
                { k:"nameAz", l:"Name (AZ)",            type:"text"   },
                { k:"weight", l:"Body weight (kg)",     type:"number" },
                { k:"age",    l:"Age",                  type:"number" },
                { k:"hrMax",  l:"Max heart rate (bpm)", type:"number" },
                { k:"hrRest", l:"Resting HR (bpm)",     type:"number" },
              ].map(f => (
                <div key={f.k} style={{ marginBottom:12 }}>
                  <div className="label" style={{ marginBottom:5 }}>{f.l}</div>
                  <input type={f.type} value={editDraft[f.k]} onChange={e=>setEditDraft(p=>({...p,[f.k]:f.type==="number"?parseFloat(e.target.value)||0:e.target.value}))}/>
                </div>
              ))}
              <div style={{ background:PALETTE.surfaceAlt,borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:PALETTE.textMid,lineHeight:1.65,fontStyle:"italic" }}>
                VO₂max from HR: Uth-Sørensen 2004. Cadence: Heiderscheit 2011. TRIMP: Banister 1991. Fatigue: proportional HR accumulation with passive decay. Pace degradation: +8% at max fatigue.
              </div>
              <div style={{ display:"flex",gap:10 }}>
                <button className="btn-primary" onClick={()=>{dispatch({type:"SET_PROFILE",payload:editDraft});setEditProf(false);}}>Save</button>
                <button className="btn-ghost" onClick={()=>setEditProf(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ SETTINGS ══ */}
      {screen==="settings" && (
        <div className="slide" style={{ padding:"20px 20px 0" }}>
          <div className="h1" style={{ marginBottom:2 }}>Settings</div>
          <div className="body" style={{ marginBottom:20,fontStyle:"italic" }}>Analytics, safety, and display preferences</div>

          <div className="label" style={{ marginBottom:12 }}>Analytics</div>
          <div className="card" style={{ marginBottom:14 }}>
            <div className="h3" style={{ marginBottom:10 }}>Weekly Volume (km)</div>
            <WeekBars data={WEEKLY_KM} days={DAYS[store.lang]} today={5}/>
            <div className="body" style={{ marginTop:8 }}>Total: <b>{sel.weekKm.toFixed(1)} km</b> · Avg: <b>{(sel.weekKm/Math.max(sel.weekRuns,1)).toFixed(1)} km</b> · {sel.weekCals.toLocaleString()} kcal</div>

            <hr className="dvd" style={{ margin:"14px 0" }}/>
            <div className="h3" style={{ marginBottom:10 }}>Pace Trend</div>
            <Sparkline data={PACE_HIST} color={PALETTE.accent} h={52}/>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,color:PALETTE.textFaint,marginTop:4 }}>
              <span>Start: {Eng.fmtPace(PACE_HIST[0])}/km</span>
              <span style={{ color:PALETTE.success }}>↑ {Eng.fmtPace(PACE_HIST[PACE_HIST.length-1])}/km today</span>
            </div>
            <div style={{ fontSize:12,color:PALETTE.success,marginTop:4 }}>↑ {(PACE_HIST[0]-PACE_HIST[PACE_HIST.length-1]).toFixed(2)} min/km improved</div>

            <hr className="dvd" style={{ margin:"14px 0" }}/>
            <div className="h3" style={{ marginBottom:10 }}>Intensity Distribution</div>
            {[{k:"Easy — aerobic base",p:55,c:PALETTE.success},{k:"Moderate — threshold",p:32,c:PALETTE.accent},{k:"Hard — VO₂max",p:13,c:PALETTE.danger}].map(b => (
              <div key={b.k} style={{ marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:PALETTE.textMid,marginBottom:4 }}><span>{b.k}</span><span style={{ fontFamily:"'Playfair Display',serif",fontWeight:500 }}>{b.p}%</span></div>
                <div style={{ height:5,background:PALETTE.border,borderRadius:2 }}><div style={{ height:"100%",width:`${b.p}%`,background:b.c,borderRadius:2,transition:`width ${K.ANIM_SLOW} ${K.EASE_OUT}` }}/></div>
              </div>
            ))}
            <div className="body" style={{ marginTop:6,fontStyle:"italic" }}>Seiler (2010): ≥80% easy volume maximises aerobic adaptation.</div>

            <hr className="dvd" style={{ margin:"14px 0" }}/>
            <div className="h3" style={{ marginBottom:10 }}>TRIMP Load Trend</div>
            <Sparkline data={store.runs.slice(0,8).reverse().map(r=>r.load||0)} color={PALETTE.info} h={40}/>
            <div className="body" style={{ marginTop:6 }}>Weekly TRIMP: <b>{sel.weekTrimp}</b> pts. &gt;400/week → elevated injury risk (Banister 1991).</div>
          </div>

          <div className="label" style={{ marginBottom:12 }}>Safety & Geofence</div>
          <div className="card" style={{ marginBottom:14 }}>
            {[
              { k:"fearDogs",     l:"Alert: loose dogs nearby" },
              { k:"fearWildlife", l:"Alert: wildlife proximity" },
              { k:"notifications",l:"Push notifications" },
            ].map((s,i) => (
              <div key={s.k}>
                {i>0 && <hr className="dvd" style={{ margin:"12px 0" }}/>}
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:15 }}>{s.l}</span>
                  <button className={`toggle ${store.settings[s.k]?"on":"off"}`} onClick={()=>dispatch({type:"SET_SETTINGS",payload:{[s.k]:!store.settings[s.k]}})}/>
                </div>
              </div>
            ))}
            <hr className="dvd" style={{ margin:"12px 0" }}/>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <span style={{ fontSize:15 }}>Alert radius</span>
              <div style={{ display:"flex",gap:6 }}>
                {[100,150,250].map(r => (
                  <button key={r} onClick={()=>dispatch({type:"SET_SETTINGS",payload:{alertRadius:r}})} style={{ padding:"5px 10px",borderRadius:6,border:`1px solid ${store.settings.alertRadius===r?PALETTE.accent:PALETTE.border}`,background:store.settings.alertRadius===r?PALETTE.accentFaint:"transparent",color:store.settings.alertRadius===r?PALETTE.accent:PALETTE.textMid,fontFamily:"'EB Garamond',serif",fontSize:12,cursor:"pointer" }}>{r}m</button>
                ))}
              </div>
            </div>
          </div>

          <div className="label" style={{ marginBottom:12 }}>Display Options</div>
          <div className="card" style={{ marginBottom:14 }}>
            {[
              { k:"showHR",      l:"Show heart rate"   },
              { k:"showCadence", l:"Show cadence"       },
              { k:"showLoad",    l:"Show TRIMP load"    },
              { k:"showVO2",     l:"Show VO₂max"        },
            ].map((s,i) => (
              <div key={s.k}>
                {i>0 && <hr className="dvd" style={{ margin:"12px 0" }}/>}
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:15 }}>{s.l}</span>
                  <button className={`toggle ${store.settings[s.k]?"on":"off"}`} onClick={()=>dispatch({type:"SET_SETTINGS",payload:{[s.k]:!store.settings[s.k]}})}/>
                </div>
              </div>
            ))}
          </div>

          <div className="label" style={{ marginBottom:12 }}>Units</div>
          <div className="card" style={{ marginBottom:14,display:"flex",gap:8 }}>
            {["metric","imperial"].map(u => (
              <button key={u} onClick={()=>dispatch({type:"SET_SETTINGS",payload:{units:u}})} style={{ flex:1,padding:"10px 0",borderRadius:8,border:`1px solid ${store.settings.units===u?PALETTE.accent:PALETTE.border}`,background:store.settings.units===u?PALETTE.accentFaint:"transparent",color:store.settings.units===u?PALETTE.accent:PALETTE.textMid,fontFamily:"'EB Garamond',serif",fontSize:14,cursor:"pointer",transition:`all ${K.ANIM_FAST}` }}>
                {u==="metric"?"Metric (km)":"Imperial (mi)"}
              </button>
            ))}
          </div>

          <button className="btn-primary" onClick={()=>{setSavedMsg(true);setTimeout(()=>setSavedMsg(false),2200);}}>
            {savedMsg?"✓ Saved":"Save Settings"}
          </button>
          <div style={{ textAlign:"center",marginTop:20,marginBottom:4,fontSize:11,color:PALETTE.textFaint,fontStyle:"italic",letterSpacing:".06em" }}>PACE CLUB BAKU · v4.0 · Baku, AZ</div>
        </div>
      )}

      {/* ══ BOTTOM NAV ══ */}
      <div style={{ position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:420,background:"rgba(244,239,230,0.97)",backdropFilter:"blur(16px)",borderTop:`1px solid ${PALETTE.border}`,display:"flex",justifyContent:"space-around",padding:"6px 0 14px",zIndex:100 }}>
        {NAV_ITEMS.map(n => (
          <button key={n.id} className={`nav-btn${screen===n.id?" active":""}`} onClick={()=>{setScreen(n.id);setSubTab(null);}}>
            <Ico n={n.ic} s={20} c={screen===n.id?PALETTE.accent:PALETTE.textFaint}/>
            <span>{isEn?n.l:n.lAz}</span>
          </button>
        ))}
      </div>

      {/* ══ REPORT MODAL ══ */}
      {reportObj && (
        <div className="overlay-bg fade" style={{ position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end" }} onClick={()=>setReport(null)}>
          <div style={{ background:PALETTE.surface,borderRadius:"18px 18px 0 0",padding:24,width:"100%",maxWidth:420,margin:"0 auto",animation:`slideUp ${K.ANIM_MED} ${K.EASE_OUT}` }} onClick={e=>e.stopPropagation()}>
            <div className="h2" style={{ marginBottom:4 }}>Report an Issue</div>
            <div className="body" style={{ fontStyle:"italic",marginBottom:16 }}>{isEn?reportObj.name:reportObj.nameAz}</div>
            {!reportDone ? (
              <>
                {["Slippery surface","Poor lighting","Heavy traffic","Obstacle on path","Construction works","Dog sighting","Wildlife nearby"].map((type,i) => (
                  <div key={i} onClick={()=>setRIdx(i)} style={{ padding:"11px 14px",borderRadius:10,marginBottom:8,background:reportIdx===i?PALETTE.accentFaint:PALETTE.bg,border:`1px solid ${reportIdx===i?PALETTE.accent:PALETTE.border}`,cursor:"pointer",fontSize:14,color:reportIdx===i?PALETTE.accent:PALETTE.text,transition:`all ${K.ANIM_FAST}` }}>{type}</div>
                ))}
                <button className="btn-primary" style={{ marginTop:12,opacity:reportIdx!==null?1:0.4 }} disabled={reportIdx===null} onClick={()=>{setRDone(true);dispatch({type:"REPORT_TRAIL",id:reportObj.id});NotifBus.push({id:`rep_${reportObj.id}_${Date.now()}`,title:"Report submitted",body:`${reportObj.name} — runners nearby notified.`,priority:2,type:"info"});}}>Submit Report</button>
              </>
            ) : (
              <div style={{ textAlign:"center",padding:"16px 0" }}>
                <div style={{ fontSize:36,color:PALETTE.success,marginBottom:10 }}><Ico n="check" s={48} c={PALETTE.success}/></div>
                <div className="h2" style={{ marginBottom:14 }}>Submitted. Runners nearby notified.</div>
                <button className="btn-ghost" style={{ width:"auto",padding:"10px 24px" }} onClick={()=>setReport(null)}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ AI MODAL ══ */}
      {aiOpen && (
        <div className="overlay-bg fade" style={{ position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"flex-end" }} onClick={()=>setAiOpen(false)}>
          <div style={{ background:PALETTE.surface,borderRadius:"18px 18px 0 0",padding:24,width:"100%",maxWidth:420,margin:"0 auto",animation:`slideUp ${K.ANIM_MED} ${K.EASE_OUT}` }} onClick={e=>e.stopPropagation()}>
            <div className="h2" style={{ marginBottom:4 }}>AI Coach Analysis</div>
            {!store.isPrem ? (
              <>
                <div className="body" style={{ fontStyle:"italic",marginBottom:18 }}>Available with Premium.</div>
                <button className="btn-primary" onClick={()=>{dispatch({type:"SET_PREM",payload:true});setAiOpen(false);setTimeout(fetchAI,400);}}>Upgrade to Premium</button>
              </>
            ) : aiLoad ? (
              <div style={{ padding:"14px 0" }}>
                {[92,76,84,60,80,65].map((w,i) => <div key={i} className="shim" style={{ height:13,width:`${w}%`,marginBottom:10 }}/>)}
              </div>
            ) : (
              <>
                <div style={{ fontSize:14,lineHeight:1.85,marginBottom:18,fontStyle:"italic",borderLeft:`2px solid ${PALETTE.accentWarm}`,paddingLeft:14,color:PALETTE.text }}>{aiText}</div>
                <button className="btn-ghost" style={{ width:"auto",padding:"10px 24px" }} onClick={()=>setAiOpen(false)}>Close</button>
              </>
            )}
          </div>
        </div>
      )}

      {shareRun && <ShareCard run={shareRun} onClose={()=>setShareRun(null)}/>}
    </div>
  );
}
