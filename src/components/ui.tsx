import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: (toast: (msg: string) => void) => ReactNode }) {
  const [msg, setMsg] = useState("");
  const timer = useRef<number>();
  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(""), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children(toast)}
      <div className="toast" role="status" hidden={!msg}>{msg}</div>
    </ToastCtx.Provider>
  );
}

// ---------- loader: a barbell doing reps ----------
export function Loader() {
  return (
    <div className="loading" role="status">
      <svg viewBox="0 0 132 84" aria-hidden="true">
        <ellipse className="shadow" cx="66" cy="78" rx="46" ry="4" />
        <g className="lift">
          <rect className="bar" x="4" y="39" width="124" height="6" rx="3" />
          <rect className="plate" x="14" y="22" width="10" height="40" rx="3" />
          <rect className="plate" x="26" y="28" width="7" height="28" rx="2" />
          <rect className="plate" x="108" y="22" width="10" height="40" rx="3" />
          <rect className="plate" x="99" y="28" width="7" height="28" rx="2" />
        </g>
      </svg>
      <span className="sr">Cargando</span>
    </div>
  );
}

// ---------- theme ----------
const isDark = () => {
  const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

export function ThemeToggle() {
  const [dark, setDark] = useState(isDark);
  const flip = () => {
    const t = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("gp.theme", t); } catch { /* storage may be blocked */ }
    setDark(!dark);
  };
  return (
    <button className="icon-btn" onClick={flip} aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={dark ? "Modo claro" : "Modo oscuro"}>
      {dark
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" /></svg>}
    </button>
  );
}

// ---------- header ----------
export function TopBar({ title, sub, back, right }: { title: string; sub?: ReactNode; back?: string; right?: ReactNode }) {
  return (
    <header className="top">
      <div className="top-left">
        {back && <Link className="back" to={back} aria-label="Volver">‹</Link>}
        <div className="brand"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      </div>
      <div className="top-right">{right}<ThemeToggle /></div>
    </header>
  );
}

// ---------- two-tap confirm for destructive actions (no browser dialogs) ----------
export function ConfirmButton({ onConfirm, children, confirmText = "¿Seguro?", className = "btn ghost danger" }:
  { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? "armed" : ""}`} onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? confirmText : children}
    </button>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <section className="empty-card"><h2>{title}</h2>{children}</section>;
}

export function BottomTabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {tabs.map(([k, label]) => <button key={k} aria-pressed={value === k} onClick={() => { onChange(k); window.scrollTo({ top: 0 }); }}>{label}</button>)}
    </nav>
  );
}

export function usePersistentState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { return (localStorage.getItem(key) as T) || initial; } catch { return initial; } });
  const set = (nv: T) => { setV(nv); try { localStorage.setItem(key, nv); } catch { /* ignore */ } };
  return [v, set];
}
