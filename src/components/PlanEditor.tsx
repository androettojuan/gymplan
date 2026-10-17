import { useId, useState, type ChangeEvent } from "react";
import type { Plan, PlanDay, PlanExercise } from "../types";
import { safeUrl, slug } from "../lib/format";
import { parsePlanPdf } from "../lib/pdfPlan";
import { ConfirmButton, useToast } from "./ui";

const blankExercise = (): PlanExercise => ({ exKey: "", name: "", sets: "", reps: "", rest: "", obs: "", video: "" });
const blankDay = (n: number): PlanDay => ({ title: `Entrenamiento ${n}`, exercises: [blankExercise()] });
export const blankPlan = (): Plan => ({ name: "", notes: [], days: [blankDay(1)] });

// Known exercises (from the gym's other plans) so names and videos autocomplete.
export type ExerciseLibrary = Map<string, PlanExercise>;

export function PlanEditor({ initial, library, saveLabel, onSave, onCancel, busy }: {
  initial: Plan; library: ExerciseLibrary; saveLabel: string; busy?: boolean;
  onSave: (p: Plan) => void; onCancel: () => void;
}) {
  const toast = useToast();
  const listId = useId();
  const [plan, setPlan] = useState<Plan>(() => JSON.parse(JSON.stringify(initial)));
  const [notesText, setNotesText] = useState(initial.notes.join("\n"));
  const [importing, setImporting] = useState(false);

  const setDay = (di: number, fn: (d: PlanDay) => PlanDay) => setPlan(p => ({ ...p, days: p.days.map((d, i) => (i === di ? fn(d) : d)) }));
  const setEx = (di: number, ei: number, patch: Partial<PlanExercise>) =>
    setDay(di, d => ({ ...d, exercises: d.exercises.map((e, i) => (i === ei ? { ...e, ...patch } : e)) }));
  const move = <T,>(arr: T[], i: number, j: number) => { const a = arr.slice(); if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };

  const onName = (di: number, ei: number, name: string) => {
    const known = library.get(slug(name));
    const cur = plan.days[di].exercises[ei];
    if (known && known.name.toLowerCase() === name.trim().toLowerCase()) {
      setEx(di, ei, { name: known.name, exKey: known.exKey, video: cur.video || known.video });
    } else setEx(di, ei, { name });
  };

  const importPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    setImporting(true);
    try {
      const p = await parsePlanPdf(await f.arrayBuffer());
      setPlan(cur => ({ ...cur, name: cur.name || p.name, days: p.days }));
      setNotesText(p.notes.join("\n"));
      toast(`PDF importado: ${p.days.length} días, ${p.days.reduce((n, d) => n + d.exercises.length, 0)} ejercicios. Revisalo y guardá.`);
    } catch (err) {
      toast((err as Error).message || "No pude leer ese PDF.");
    }
    setImporting(false);
  };

  const submit = () => {
    const days = plan.days.map(d => ({
      ...d,
      exercises: d.exercises.filter(x => x.name.trim()).map(x => ({ ...x, name: x.name.trim(), exKey: x.exKey || slug(x.name), video: safeUrl(x.video.trim()) })),
    })).filter(d => d.exercises.length);
    if (!plan.name.trim()) { toast("Ponele un nombre al plan."); return; }
    if (!days.length) { toast("Agregá al menos un ejercicio."); return; }
    onSave({ ...plan, days, notes: notesText.split("\n").map(s => s.replace(/^\s*-\s*/, "").trim()).filter(Boolean) });
  };

  return (
    <div className="editor">
      <datalist id={listId}>{[...library.values()].map(e => <option key={e.exKey} value={e.name} />)}</datalist>
      <section className="card">
        <div className="field"><label htmlFor="pl-name">Nombre del plan</label>
          <input id="pl-name" placeholder="Ej: Principiante 3 días" value={plan.name} onChange={e => setPlan({ ...plan, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="pl-notes">Indicaciones generales (una por línea)</label>
          <textarea id="pl-notes" rows={3} placeholder={"Descansar 2-3 min entre series\nSobrecarga progresiva semana a semana"} value={notesText} onChange={e => setNotesText(e.target.value)} /></div>
        <div className="links">
          <label className="btn" htmlFor="pl-pdf">{importing ? "Leyendo PDF…" : "Importar desde PDF"}</label>
          <input className="sr" id="pl-pdf" type="file" accept="application/pdf,.pdf" onChange={importPdf} disabled={importing} />
          <span className="obs">Reemplaza los días por los del PDF.</span>
        </div>
      </section>

      {plan.days.map((d, di) => (
        <section className="card day-edit" key={di}>
          <div className="day-head">
            <input aria-label="Nombre del día" className="day-title" value={d.title} onChange={e => setDay(di, x => ({ ...x, title: e.target.value }))} />
            <div className="row-actions">
              <button className="mini" disabled={di === 0} onClick={() => setPlan(p => ({ ...p, days: move(p.days, di, di - 1) }))} aria-label="Subir día">↑</button>
              <button className="mini" disabled={di === plan.days.length - 1} onClick={() => setPlan(p => ({ ...p, days: move(p.days, di, di + 1) }))} aria-label="Bajar día">↓</button>
              {plan.days.length > 1 && <ConfirmButton className="mini" confirmText="¿Quitar día?" onConfirm={() => setPlan(p => ({ ...p, days: p.days.filter((_, i) => i !== di) }))}>Quitar</ConfirmButton>}
            </div>
          </div>
          {d.exercises.map((x, ei) => (
            <div className="ex-edit" key={ei}>
              <div className="ex-edit-head">
                <span className="ex-idx num">{ei + 1}</span>
                <input aria-label="Ejercicio" list={listId} placeholder="Ejercicio" value={x.name} onChange={e => onName(di, ei, e.target.value)} />
                <div className="row-actions">
                  <button className="mini" disabled={ei === 0} onClick={() => setDay(di, dd => ({ ...dd, exercises: move(dd.exercises, ei, ei - 1) }))} aria-label="Subir">↑</button>
                  <button className="mini" disabled={ei === d.exercises.length - 1} onClick={() => setDay(di, dd => ({ ...dd, exercises: move(dd.exercises, ei, ei + 1) }))} aria-label="Bajar">↓</button>
                  <button className="mini" onClick={() => setDay(di, dd => ({ ...dd, exercises: dd.exercises.filter((_, i) => i !== ei) }))} aria-label="Quitar ejercicio">✕</button>
                </div>
              </div>
              <div className="ex-edit-grid">
                <input aria-label="Series" placeholder="Series" inputMode="numeric" value={x.sets} onChange={e => setEx(di, ei, { sets: e.target.value })} />
                <input aria-label="Reps" placeholder="Reps" value={x.reps} onChange={e => setEx(di, ei, { reps: e.target.value })} />
                <input aria-label="Descanso" placeholder="Descanso" value={x.rest} onChange={e => setEx(di, ei, { rest: e.target.value })} />
                <input aria-label="Link del video" placeholder="Link del video" inputMode="url" value={x.video} onChange={e => setEx(di, ei, { video: e.target.value })} className="wide" />
                <input aria-label="Observaciones" placeholder="Observaciones" value={x.obs} onChange={e => setEx(di, ei, { obs: e.target.value })} className="wide" />
              </div>
            </div>
          ))}
          <button className="btn ghost" onClick={() => setDay(di, dd => ({ ...dd, exercises: [...dd.exercises, blankExercise()] }))}>+ Agregar ejercicio</button>
        </section>
      ))}
      <button className="btn ghost add-day" onClick={() => setPlan(p => ({ ...p, days: [...p.days, blankDay(p.days.length + 1)] }))}>+ Agregar día</button>

      <div className="save-bar">
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Guardando…" : saveLabel}</button>
      </div>
    </div>
  );
}

export function buildLibrary(plans: Plan[]): ExerciseLibrary {
  const lib: ExerciseLibrary = new Map();
  for (const p of plans) for (const d of p.days) for (const e of d.exercises) {
    const k = slug(e.name);
    if (!lib.has(k) || (!lib.get(k)!.video && e.video)) lib.set(k, e);
  }
  return lib;
}
