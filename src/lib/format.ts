export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const pad = (n: number) => String(n).padStart(2, "0");

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const fmtDate = (s: string) => {
  const [, m, d] = s.split("-");
  return `${+d} ${MONTHS[+m - 1]}`;
};

export const daysAgo = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date();
  return Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / 864e5);
};

export const relDate = (s: string) => {
  const n = daysAgo(s);
  return n <= 0 ? "hoy" : n === 1 ? "ayer" : n < 30 ? `hace ${n} días` : fmtDate(s);
};

export const fmtW = (w: number | null | undefined) =>
  w == null ? "—" : String(Math.round(w * 100) / 100).replace(".", ",");

export const parseW = (s: string | number | null | undefined) => {
  const v = parseFloat(String(s ?? "").replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "ejercicio";

export const safeUrl = (u: string) => (/^https?:\/\//i.test(u || "") ? u : "");

export const randomToken = (len = 20) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
};

export const dayLabel = (title: string) => title.replace(/^Entrenamiento\s*/i, "Día ");
