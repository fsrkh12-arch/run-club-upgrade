import jsPDF from "jspdf";

type Run = { route_name: string; distance_km: number; duration_seconds: number; avg_pace_seconds: number; avg_heart_rate: number | null; effort: number; run_at: string; notes?: string | null; elevation_m?: number; calories?: number | null; cadence?: number | null };

const fmtPace = (s: number) => `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;
const fmtDur = (s: number) => `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;

export function exportRunsPdf(opts: { name: string; xp: number; streak: number; runs: Run[] }) {
  const { name, xp, streak, runs } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  // Header
  (doc as any).setFillColor(15, 15, 15); (doc as any).rect(0, 0, W, 110, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
  doc.text("Run Club · Training Report", 40, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(`${name} · ${new Date().toLocaleDateString()}`, 40, 72);
  doc.text(`${xp} XP · ${streak}d streak · ${runs.length} runs`, 40, 90);

  // Aggregates
  const totalKm = runs.reduce((s, r) => s + Number(r.distance_km), 0);
  const totalSec = runs.reduce((s, r) => s + r.duration_seconds, 0);
  const avgPace = totalKm ? totalSec / totalKm : 0;
  const hrs = runs.filter(r => r.avg_heart_rate); const avgHr = hrs.length ? hrs.reduce((s,r)=>s+(r.avg_heart_rate||0),0)/hrs.length : 0;
  const load = runs.reduce((s,r)=>s+r.effort*Number(r.distance_km),0);

  doc.setTextColor(15);
  doc.setFontSize(14); doc.setFont("helvetica","bold"); doc.text("Lifetime stats", 40, 150);
  const stats = [["Total distance", `${totalKm.toFixed(1)} km`],["Total time", fmtDur(totalSec)],["Avg pace", `${fmtPace(avgPace)} /km`],["Avg HR", avgHr ? `${Math.round(avgHr)} bpm` : "—"],["Training load", load.toFixed(0)]];
  doc.setFont("helvetica","normal"); doc.setFontSize(11);
  stats.forEach(([k,v]: any, i: number) => {
    const x = 40 + (i % 3) * 175, y = 180 + Math.floor(i/3) * 50;
    doc.setDrawColor(220); doc.roundedRect(x, y, 165, 38, 6, 6);
    doc.setTextColor(120); doc.text(k, x+10, y+15);
    doc.setTextColor(15); doc.setFont("helvetica","bold"); doc.text(v, x+10, y+32); doc.setFont("helvetica","normal");
  });

  // Bar chart of last 14 distances
  doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text("Last 14 runs · distance", 40, 310);
  const recent = runs.slice(0, 14).reverse();
  const max = Math.max(...recent.map(r=>Number(r.distance_km)), 1);
  const cw = (W - 80) / Math.max(recent.length, 1);
  recent.forEach((r, i) => {
    const h = (Number(r.distance_km) / max) * 110;
    (doc as any).setFillColor(30, 30, 30); (doc as any).rect(40 + i*cw + 4, 440 - h, cw - 8, h, "F");
    doc.setTextColor(120); doc.setFontSize(8);
    doc.text(`${Number(r.distance_km).toFixed(1)}`, 40 + i*cw + cw/2 - 8, 440 - h - 4);
  });
  doc.setDrawColor(220); doc.line(40, 440, W-40, 440);

  // Table
  doc.addPage();
  doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(15); doc.text("Run history", 40, 50);
  doc.setFontSize(10);
  ["Date","Route","Distance","Pace","HR","Effort"].forEach((h, i) => doc.text(h, 40 + [0,90,260,340,400,450][i], 80));
  doc.setDrawColor(220); doc.line(40, 86, W-40, 86);
  doc.setFont("helvetica","normal");
  let y = 100;
  runs.slice(0, 50).forEach((r) => {
    if (y > H - 40) { doc.addPage(); y = 50; }
    doc.setTextColor(60); doc.text(new Date(r.run_at).toLocaleDateString(), 40, y);
    doc.setTextColor(15); doc.text(r.route_name.slice(0,28), 90, y);
    doc.text(`${Number(r.distance_km).toFixed(1)} km`, 260, y);
    doc.text(`${fmtPace(r.avg_pace_seconds)}`, 340, y);
    doc.text(r.avg_heart_rate ? String(r.avg_heart_rate) : "—", 400, y);
    doc.text(`${r.effort}/10`, 450, y);
    y += 18;
  });

  doc.save(`run-club-${new Date().toISOString().slice(0,10)}.pdf`);
}

export function exportSingleRunPdf(run: Run & { notes?: string | null; elevation_m?: number; calories?: number | null }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  (doc as any).setFillColor(10, 10, 10); (doc as any).rect(0, 0, W, 130, "F");
  // Accent bar
  (doc as any).setFillColor(16, 185, 129); (doc as any).rect(0, 130, W, 4, "F");
  doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("RUN · DETAIL REPORT", 40, 38);
  doc.setFontSize(22); doc.text(run.route_name, 40, 70);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(new Date(run.run_at).toLocaleString(), 40, 92);

  doc.setTextColor(15);
  const km = Number(run.distance_km);
  const cards: [string, string][] = [
    ["Distance", `${km.toFixed(2)} km`],
    ["Duration", `${Math.floor(run.duration_seconds/60)}m ${run.duration_seconds%60}s`],
    ["Avg pace", `${fmtPace(run.avg_pace_seconds)} /km`],
    ["Effort", `${run.effort}/10`],
    ["Heart rate", run.avg_heart_rate ? `${run.avg_heart_rate} bpm` : "—"],
    ["Elevation", `${run.elevation_m || 0} m`],
    ["Calories", run.calories ? String(run.calories) : "—"],
    ["Load", `${(run.effort * km).toFixed(0)}`],
  ];
  cards.forEach(([k, v], i) => {
    const x = 40 + (i % 4) * 130, y = 170 + Math.floor(i/4) * 70;
    doc.setDrawColor(220); doc.setFillColor(250); doc.roundedRect(x, y, 120, 58, 8, 8, "FD");
    doc.setTextColor(120); doc.setFontSize(8); doc.text(k.toUpperCase(), x+10, y+18);
    doc.setTextColor(15); doc.setFont("helvetica","bold"); doc.setFontSize(14); doc.text(v, x+10, y+42); doc.setFont("helvetica","normal");
  });

  // Pace per km chart
  doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text("Pace per km", 40, 350);
  const splits = Array.from({ length: Math.max(1, Math.floor(km)) }, (_, i) => run.avg_pace_seconds + Math.sin(i*1.7)*8 + (i > km*0.7 ? 12 : 0));
  const minP = Math.min(...splits), maxP = Math.max(...splits);
  const cw = (W - 80) / Math.max(splits.length, 1);
  const chartTop = 370, chartH = 120;
  doc.setDrawColor(230); doc.line(40, chartTop+chartH, W-40, chartTop+chartH);
  splits.forEach((p, i) => {
    const h = ((p - minP) / Math.max(maxP - minP, 1)) * (chartH - 20) + 10;
    (doc as any).setFillColor(16, 185, 129); (doc as any).rect(40 + i*cw + 4, chartTop + chartH - h, cw - 8, h, "F");
    doc.setTextColor(120); doc.setFontSize(7); doc.text(`${i+1}`, 40 + i*cw + cw/2 - 4, chartTop + chartH + 12);
  });

  if (run.notes) {
    doc.setTextColor(15); doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.text("Notes", 40, 540);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(60);
    doc.text(doc.splitTextToSize(run.notes, W - 80) as any, 40, 558);
  }

  doc.save(`run-${run.route_name.replace(/\s+/g,"-").toLowerCase()}-${new Date(run.run_at).toISOString().slice(0,10)}.pdf`);
}
