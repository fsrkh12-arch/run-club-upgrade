import jsPDF from "jspdf";

type Run = { route_name: string; distance_km: number; duration_seconds: number; avg_pace_seconds: number; avg_heart_rate: number | null; effort: number; run_at: string };

const fmtPace = (s: number) => `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,"0")}`;
const fmtDur = (s: number) => `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;

export function exportRunsPdf(opts: { name: string; xp: number; streak: number; runs: Run[] }) {
  const { name, xp, streak, runs } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  // Header
  doc.setFillColor(15, 15, 15); doc.rect(0, 0, W, 110, "F");
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
  stats.forEach(([k,v], i) => {
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
    doc.setFillColor(30); doc.rect(40 + i*cw + 4, 440 - h, cw - 8, h, "F");
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
