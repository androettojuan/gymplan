import type { Role } from "../types";
import { useToast } from "./ui";

const MESSAGES: Record<Role, (gym: string, url: string) => string> = {
  member: (gym, url) => `Hola! Te comparto tu plan de entrenamiento de ${gym}. Entrá con este link: ${url}`,
  staff: (gym, url) => `Hola! Te invito a sumarte como empleado de ${gym} en GymPlan: ${url}`,
  owner: (gym, url) => `Hola! Ya está listo ${gym} en GymPlan. Entrá con este link para administrarlo: ${url}`,
};

export function ShareLink({ url, gymName, role }: { url: string; gymName: string; role: Role }) {
  const toast = useToast();
  const msg = MESSAGES[role](gymName, url);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copiado"); }
    catch { toast("No se pudo copiar. Mantené apretado el link para copiarlo."); }
  };
  const share = async () => { try { await navigator.share({ title: gymName, text: msg }); } catch { /* cancelled */ } };
  return (
    <div className="share">
      <code className="link-box">{url}</code>
      <div className="links">
        <a className="btn primary" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Enviar por WhatsApp</a>
        <button type="button" className="btn" onClick={copy}>Copiar link</button>
        {"share" in navigator && <button type="button" className="btn ghost" onClick={share}>Compartir…</button>}
      </div>
    </div>
  );
}
