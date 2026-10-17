import type { Plan, PlanDay } from "../types";
import { safeUrl, slug } from "./format";

// Reads the gym's usual spreadsheet-style PDF: "Entrenamiento N" blocks with the columns
// Ejercicio / Video / Series / Reps / Descanso / Observaciones, video links as PDF annotations.

interface Item { x0: number; x1: number; y: number; h: number; str: string }
interface Link { x0: number; x1: number; y0: number; y1: number; url: string }
interface Row { y: number; items: Item[]; text: string; links: Link[] }

const HEADERS: [RegExp, string][] = [
  [/^ejercicio/i, "name"], [/^video/i, "video"], [/^series/i, "sets"],
  [/^rep/i, "reps"], [/^descanso/i, "rest"], [/^observ/i, "obs"],
];

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export interface ParsedPdf extends Plan {
  gym: string;
  coach: string;
}

export async function parsePlanPdf(buf: ArrayBuffer): Promise<ParsedPdf> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
  const rows: Row[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const links: Link[] = (await page.getAnnotations())
      .filter((a: { subtype: string; url?: string }) => a.subtype === "Link" && a.url)
      .map((a: { rect: number[]; url: string }) => {
        const [x0, y0, x1, y1] = a.rect;
        return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), url: a.url };
      });
    const items: Item[] = (tc.items as { str?: string; transform: number[]; width: number }[])
      .filter(i => i.str && i.str.trim())
      .map(i => ({ x0: i.transform[4], x1: i.transform[4] + i.width, y: i.transform[5], h: Math.abs(i.transform[3]) || 8, str: i.str!.replace(/\s+/g, " ").trim() }))
      .sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const pageRows: Row[] = [];
    for (const it of items) {
      let r = pageRows.find(r => Math.abs(r.y - it.y) < 4);
      if (!r) { r = { y: it.y, items: [], text: "", links: [] }; pageRows.push(r); }
      r.items.push(it);
    }
    pageRows.sort((a, b) => b.y - a.y);
    for (const r of pageRows) {
      r.items.sort((a, b) => a.x0 - b.x0);
      r.text = r.items.map(i => i.str).join(" ");
      const mid = r.y + r.items[0].h * 0.3;
      r.links = links.filter(l => mid >= l.y0 - 1 && mid <= l.y1 + 1);
      rows.push(r);
    }
  }

  const plan: ParsedPdf = { name: "", gym: "", coach: "", notes: [], days: [] };
  let day: PlanDay | null = null;
  let cols: { key: string; c: number }[] | null = null;
  let inNotes = false;
  let m: RegExpMatchArray | null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], t = r.text;
    if ((m = t.match(/Profe(?:sor|sora)?\s*:?\s*(.+)/i)) && !plan.coach) {
      plan.coach = m[1].trim();
      const prev = rows[i - 1];
      if (prev) plan.gym = prev.items.filter(x => !/^logo$/i.test(x.str)).map(x => x.str).join(" ");
      continue;
    }
    if (/observaciones generales/i.test(t)) { inNotes = true; continue; }
    if ((m = t.match(/^(Entrenamiento|D[íi]a|Rutina)\s*(\d+)/i))) {
      inNotes = false;
      day = { title: `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`, exercises: [] };
      plan.days.push(day); cols = null; continue;
    }
    if (inNotes) {
      if (/n[úu]mero de entrenamientos/i.test(t)) { inNotes = false; continue; }
      const line = t.replace(/^\s*-\s*/, "").trim();
      if (line) plan.notes.push(line);
      continue;
    }
    if (/FIN_ENTRENAMIENTO/i.test(t)) { day = null; cols = null; continue; }
    if (r.items.some(x => /^ejercicio$/i.test(x.str))) {
      if (!day) { day = { title: `Entrenamiento ${plan.days.length + 1}`, exercises: [] }; plan.days.push(day); }
      cols = r.items.map(x => { const h = HEADERS.find(([re]) => re.test(x.str)); return { key: h ? h[1] : "other", c: (x.x0 + x.x1) / 2 }; });
      continue;
    }
    if (!day || !cols) continue;
    const ex: Record<string, string[]> = { name: [], sets: [], reps: [], rest: [], obs: [] };
    let video = "";
    for (const it of r.items) {
      const c = (it.x0 + it.x1) / 2;
      const link = r.links.find(l => c >= l.x0 - 2 && c <= l.x1 + 2);
      if (link) { video = video || link.url; continue; }
      let best = cols[0];
      for (const col of cols) if (Math.abs(col.c - c) < Math.abs(best.c - c)) best = col;
      if (best.key === "name" || it.x0 < cols[0].c) ex.name.push(it.str);
      else if (ex[best.key]) ex[best.key].push(it.str);
    }
    if (!video && r.links.length) video = r.links[0].url;
    const name = ex.name.join(" ").replace(/\s*\|\s*$/, "").trim();
    if (!name || /^n[ºo°]\s*de\s*ej/i.test(name)) continue;
    day.exercises.push({
      exKey: slug(name), name, sets: ex.sets.join(" "), reps: ex.reps.join(" "),
      rest: ex.rest.join(" "), obs: ex.obs.join(" "), video: safeUrl(video),
    });
  }
  plan.days = plan.days.filter(d => d.exercises.length);
  if (!plan.days.length) throw new Error("No encontré ejercicios en ese PDF. ¿Es la planilla del gimnasio?");
  plan.name = plan.coach ? `Plan de ${plan.coach}` : "Plan importado";
  return plan;
}
