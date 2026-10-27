import { useState, type FormEvent } from "react";
import type { ExerciseLog, LogEntry, Plan, PlanExercise } from "../types";
import { dayLabel, fmtDate, fmtW, parseW, relDate, today } from "../lib/format";
import { ConfirmButton, usePersistentState } from "./ui";
import { Delta, LineChart } from "./LineChart";

export type Logs = Record<string, ExerciseLog>;

export const entriesOf = (logs: Logs, exKey: string) =>
  ((logs[exKey] && logs[exKey].entries) || []).slice().sort((a, b) => a.d.localeCompare(b.d));
const weighted = (e: LogEntry[]) => e.filter(x => x.w != null) as (LogEntry & { w: number })[];

interface Draft { w: string; r: string; n: string; d: string }

export function TrainingView({ plan, logs, onSaveLog, onDeleteLog, storageKey }: {
  plan: Plan; logs: Logs; storageKey: string;
  onSaveLog?: (ex: PlanExercise, entries: LogEntry[]) => void;
  onDeleteLog?: (ex: PlanExercise) => void;
}) {
  const [dayStr, setDayStr] = usePersistentState<string>(storageKey + ".day", "0");
  const di = Math.min(+dayStr || 0, plan.days.length - 1);
  const day = plan.days[di];
  const [open, setOpen] = useState<string | null>(null);
  const dayLast = (i: number) => plan.days[i].exercises.reduce((best, e) => {
    const l = entriesOf(logs, e.exKey).pop(); return l && l.d > best ? l.d : best;
  }, "");

  return (
    <>
      <nav className="days" aria-label="Entrenamientos">
        {plan.days.map((d, i) => {
          const l = dayLast(i);
          return (
            <button key={i} aria-pressed={i === di} onClick={() => { setDayStr(String(i)); setOpen(null); }}>
              <b>{dayLabel(d.title)}</b><small>{l ? relDate(l) : `${d.exercises.length} ejercicios`}</small>
            </button>
          );
        })}
      </nav>
      {plan.notes.length > 0 && (
        <details className="notes"><summary>Indicaciones del profe</summary><ul>{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>
      )}
      <section className="list" aria-label={day.title}>
        {day.exercises.map((ex, i) => (
          <ExerciseCard key={ex.exKey + i} ex={ex} index={i} entries={entriesOf(logs, ex.exKey)}
            open={open === ex.exKey} onToggle={() => setOpen(open === ex.exKey ? null : ex.exKey)}
            onSave={onSaveLog && (entries => onSaveLog(ex, entries))}
            onDeleteAll={onDeleteLog && (() => onDeleteLog(ex))} />
        ))}
      </section>
    </>
  );
}

function ExerciseCard({ ex, index, entries, open, onToggle, onSave, onDeleteAll }: {
  ex: PlanExercise; index: number; entries: LogEntry[]; open: boolean; onToggle: () => void;
  onSave?: (entries: LogEntry[]) => void; onDeleteAll?: () => void;
}) {
  const last = entries[entries.length - 1];
  const w = weighted(entries);
  const lastW = w.length ? w[w.length - 1].w : null;
  const done = last && last.d === today();
  const [draft, setDraft] = useState<Draft>(() => ({ w: lastW == null ? "" : fmtW(lastW), r: "", n: "", d: today() }));
  const sameDay = entries.some(e => e.d === draft.d);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    const wv = parseW(draft.w);
    if (wv == null && !draft.r.trim()) return;
    const d = draft.d || today();
    const next = entries.filter(x => x.d !== d).concat({ d, w: wv, r: draft.r.trim(), n: draft.n.trim() }).sort((a, b) => a.d.localeCompare(b.d));
    onSave(next);
    setDraft({ w: wv == null ? "" : fmtW(wv), r: "", n: "", d: today() });
  };
  const remove = (d: string) => {
    const next = entries.filter(x => x.d !== d);
    if (next.length) onSave?.(next); else onDeleteAll?.();
  };
  const step = (delta: number) => setDraft(s => ({ ...s, w: fmtW(Math.max(0, (parseW(s.w) || 0) + delta)) }));

  return (
    <article className={`ex ${open ? "open" : ""} ${done ? "done" : ""}`}>
      <button className="ex-head" onClick={onToggle} aria-expanded={open}>
        <span className="ex-idx num">{done ? "✓" : index + 1}</span>
        <span>
          <span className="ex-name">{ex.name}</span>
          <span className="ex-meta">
            {(ex.sets || ex.reps) && <span className="chip sr-chip num">{ex.reps ? `${ex.sets || "?"} × ${ex.reps}` : `${ex.sets} series`}</span>}
            {done && <span className="chip ok">Hecho hoy</span>}
          </span>
        </span>
        {lastW != null
          ? <span className="ex-last num"><b>{fmtW(lastW)}</b><span>kg</span><small>{relDate(last.d)}</small></span>
          : <span className="ex-last none">{last ? relDate(last.d) : "sin anotar"}</span>}
      </button>
      {open && (
        <div className="panel">
          {(ex.video || ex.rest || ex.obs) && (
            <div className="links">
              {ex.video && <a className="btn" href={ex.video} target="_blank" rel="noopener noreferrer">▶ Ver video</a>}
              {(ex.rest || ex.obs) && <p className="obs">{[ex.rest && `Descanso: ${ex.rest}`, ex.obs].filter(Boolean).join(" · ")}</p>}
            </div>
          )}
          {onSave && (
            <form className="form" onSubmit={save}>
              <div className="field full"><label htmlFor={`w-${ex.exKey}`}>Peso (kg)</label>
                <div className="stepper">
                  <button type="button" onClick={() => step(-2.5)} aria-label="Restar 2,5 kg">−</button>
                  <input id={`w-${ex.exKey}`} className="num" inputMode="decimal" autoComplete="off" placeholder="0" value={draft.w} onChange={e => setDraft({ ...draft, w: e.target.value })} />
                  <button type="button" onClick={() => step(2.5)} aria-label="Sumar 2,5 kg">+</button>
                </div>
              </div>
              <div className="field"><label htmlFor={`r-${ex.exKey}`}>Reps hechas</label>
                <input id={`r-${ex.exKey}`} autoComplete="off" placeholder={ex.reps || "ej. 10"} value={draft.r} onChange={e => setDraft({ ...draft, r: e.target.value })} /></div>
              <div className="field"><label htmlFor={`d-${ex.exKey}`}>Fecha</label>
                <input id={`d-${ex.exKey}`} type="date" max={today()} value={draft.d} onChange={e => setDraft({ ...draft, d: e.target.value })} /></div>
              <div className="field full"><label htmlFor={`n-${ex.exKey}`}>Nota</label>
                <input id={`n-${ex.exKey}`} autoComplete="off" placeholder="Ej: última serie al fallo" value={draft.n} onChange={e => setDraft({ ...draft, n: e.target.value })} /></div>
              <div className="actions"><button className="btn primary" type="submit">{sameDay ? `Actualizar ${draft.d === today() ? "hoy" : fmtDate(draft.d)}` : "Guardar"}</button></div>
            </form>
          )}
          <History entries={entries} name={ex.name}
            onEdit={onSave && (e => setDraft({ w: e.w == null ? "" : fmtW(e.w), r: e.r || "", n: e.n || "", d: e.d }))}
            onDelete={onSave && remove} />
        </div>
      )}
    </article>
  );
}

function History({ entries, name, onEdit, onDelete }: { entries: LogEntry[]; name: string; onEdit?: (e: LogEntry) => void; onDelete?: (d: string) => void }) {
  const w = weighted(entries);
  return (
    <div className="hist">
      <h3>Historial</h3>
      {w.length > 1 && <LineChart points={w} label={name} />}
      <ol>
        {entries.length ? entries.slice().reverse().map(e => (
          <li key={e.d}>
            <span className="d num">{fmtDate(e.d)}</span>
            <span className="w num">{e.w != null ? `${fmtW(e.w)} kg` : "—"}</span>
            <span className="rn">{e.r ? `${e.r} reps` : ""}{e.n && <small>{e.n}</small>}</span>
            <span className="row-actions">
              {onEdit && <button className="mini" onClick={() => onEdit(e)}>Editar</button>}
              {onDelete && <ConfirmButton className="mini" confirmText="¿Borrar?" onConfirm={() => onDelete(e.d)}>Borrar</ConfirmButton>}
            </span>
          </li>
        )) : <li className="empty">Todavía no hay registros de este ejercicio.</li>}
      </ol>
    </div>
  );
}

// ---------- progress ----------
export function BodyCard({ entries, onSave }: { entries: { d: string; w: number }[]; onSave?: (entries: { d: string; w: number }[]) => void }) {
  const list = entries.slice().sort((a, b) => a.d.localeCompare(b.d));
  const last = list[list.length - 1];
  const [draft, setDraft] = useState(() => ({ w: last ? fmtW(last.w) : "", d: today() }));
  const same = list.some(e => e.d === draft.d);
  const save = (e: FormEvent) => {
    e.preventDefault();
    const w = parseW(draft.w);
    if (w == null || w <= 0 || !onSave) return;
    onSave(list.filter(x => x.d !== draft.d).concat({ d: draft.d || today(), w }).sort((a, b) => a.d.localeCompare(b.d)));
    setDraft({ w: fmtW(w), d: today() });
  };
  const step = (delta: number) => setDraft(s => ({ ...s, w: fmtW(Math.max(0, Math.round(((parseW(s.w) || 0) + delta) * 10) / 10)) }));
  return (
    <section className="card">
      <div className="card-head"><h2>Peso corporal</h2>{last && <span className="big num">{fmtW(last.w)}<small> kg</small></span>}</div>
      {list.length > 1
        ? <><p className="obs"><Delta from={list[0].w} to={last.w} /> desde el {fmtDate(list[0].d)} · {list.length} registros</p><LineChart points={list} label="Peso corporal" /></>
        : <p className="obs">{list.length ? "Con un registro más aparece el gráfico." : onSave ? "Anotá tu peso para empezar a ver cómo cambia." : "Todavía no anotó su peso."}</p>}
      {onSave && (
        <form className="form" onSubmit={save}>
          <div className="field"><label htmlFor="bw">Tu peso (kg)</label>
            <div className="stepper">
              <button type="button" onClick={() => step(-0.1)} aria-label="Restar 100 g">−</button>
              <input id="bw" className="num" inputMode="decimal" autoComplete="off" placeholder="0" value={draft.w} onChange={e => setDraft({ ...draft, w: e.target.value })} />
              <button type="button" onClick={() => step(0.1)} aria-label="Sumar 100 g">+</button>
            </div>
          </div>
          <div className="field"><label htmlFor="bd">Fecha</label><input id="bd" type="date" max={today()} value={draft.d} onChange={e => setDraft({ ...draft, d: e.target.value })} /></div>
          <div className="actions"><button className="btn primary" type="submit">{same ? `Actualizar ${draft.d === today() ? "hoy" : fmtDate(draft.d)}` : "Guardar peso"}</button></div>
        </form>
      )}
      {onSave && list.length > 0 && (
        <div className="hist"><ol>{list.slice().reverse().slice(0, 6).map(e => (
          <li key={e.d} className="body-row"><span className="d num">{fmtDate(e.d)}</span><span className="w num">{fmtW(e.w)} kg</span><span />
            <span className="row-actions"><ConfirmButton className="mini" confirmText="¿Borrar?" onConfirm={() => onSave(list.filter(x => x.d !== e.d))}>Borrar</ConfirmButton></span></li>
        ))}</ol></div>
      )}
    </section>
  );
}

export function LiftsCard({ plan, logs, emptyText }: { plan: Plan | null; logs: Logs; emptyText: string }) {
  const [open, setOpen] = useState<string | null>(null);
  // Exercises from the current plan first, then anything logged earlier that is no longer in it.
  const seen = new Set<string>();
  const rows: { key: string; name: string; day: string; pts: (LogEntry & { w: number })[] }[] = [];
  for (const d of plan?.days || []) for (const ex of d.exercises) {
    if (seen.has(ex.exKey)) continue; seen.add(ex.exKey);
    const pts = weighted(entriesOf(logs, ex.exKey));
    if (pts.length) rows.push({ key: ex.exKey, name: ex.name, day: dayLabel(d.title), pts });
  }
  for (const [key, log] of Object.entries(logs)) {
    if (seen.has(key)) continue;
    const pts = weighted(entriesOf(logs, key));
    if (pts.length) rows.push({ key, name: log.name, day: "Plan anterior", pts });
  }
  return (
    <section className="card">
      <h2>Levantamientos</h2>
      {!rows.length ? <p className="obs">{emptyText}</p> : <>
        <p className="obs">Tocá un ejercicio para ver su gráfico.</p>
        <div className="lifts">{rows.map(({ key, name, day, pts }) => {
          const a = pts[0], b = pts[pts.length - 1], isOpen = open === key;
          return (
            <article key={key} className={`ex ${isOpen ? "open" : ""}`}>
              <button className="ex-head lift" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                <span><span className="ex-name">{name}</span>
                  <span className="ex-meta"><span>{day}</span><span>{pts.length} {pts.length === 1 ? "registro" : "registros"}</span>{pts.length > 1 && <Delta from={a.w} to={b.w} />}</span></span>
                <span className="ex-last num"><b>{fmtW(b.w)}</b><span>kg</span></span>
              </button>
              {isOpen && <div className="panel">
                {pts.length > 1 ? <LineChart points={pts} label={name} /> : <p className="obs">Con un registro más aparece el gráfico.</p>}
                {pts.length > 1 && <p className="obs">Máximo: <b>{fmtW(Math.max(...pts.map(p => p.w)))} kg</b> · Primer registro: {fmtW(a.w)} kg el {fmtDate(a.d)}</p>}
              </div>}
            </article>
          );
        })}</div>
      </>}
    </section>
  );
}
