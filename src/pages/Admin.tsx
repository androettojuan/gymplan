import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { where } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { isSuperAdmin } from "../lib/admin";
import { useCollection } from "../lib/hooks";
import { createGymWithOwnerInvite, createInvite, inviteUrl } from "../lib/data";
import { fmtDate } from "../lib/format";
import type { Gym, Invite, Member } from "../types";
import { Loader, TopBar, useToast } from "../components/ui";
import { ShareLink } from "../components/ShareLink";

const dateOf = (ms?: number) => (ms ? fmtDate(new Date(ms).toISOString().slice(0, 10)) : "");

export function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const gyms = useCollection<Omit<Gym, "id">>(isSuperAdmin(user) ? "gyms" : null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; gymName: string } | null>(null);

  if (!isSuperAdmin(user)) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    try {
      const { token } = await createGymWithOwnerInvite(user, name, owner);
      setCreated({ url: inviteUrl(token), gymName: name.trim() });
      setName(""); setOwner("");
    } catch (err) { toast(`No se pudo crear el gimnasio (${(err as { code?: string }).code || "error"}).`); }
    setBusy(false);
  };

  return (
    <div className="wrap">
      <TopBar title="Gimnasios" sub="Súper admin" back="/" />
      <form className="card" onSubmit={submit}>
        <h2>Nuevo gimnasio</h2>
        <div className="field"><label htmlFor="gym-name">Nombre del gimnasio</label>
          <input id="gym-name" placeholder="Ej: Roma Gym" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="gym-owner">Dueño (opcional, para reconocer el link)</label>
          <input id="gym-owner" placeholder="Ej: Marcelo" value={owner} onChange={e => setOwner(e.target.value)} /></div>
        <p className="obs">Se crea el gimnasio y un link para el dueño. Mandáselo: cuando entre con Google queda como dueño y puede agregar a sus empleados. El link sirve una sola vez y vence en 30 días.</p>
        <button className="btn primary" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear gimnasio"}</button>
        {created && <ShareLink url={created.url} gymName={created.gymName} role="owner" />}
      </form>

      <section className="card">
        <div className="card-head"><h2>Todos los gimnasios</h2><span className="count num">{gyms.data.length}</span></div>
        {gyms.loading ? <Loader /> : !gyms.data.length ? <p className="obs">Todavía no creaste gimnasios.</p> : (
          <div className="rows">
            {gyms.data.slice().sort((a, b) => b.createdAt - a.createdAt).map(g => <GymRow key={g.id} gym={{ ...g }} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function GymRow({ gym }: { gym: Gym }) {
  const { user } = useAuth();
  const toast = useToast();
  const owners = useCollection<Omit<Member, "uid">>(`gyms/${gym.id}/members`, [where("role", "==", "owner")], "owners");
  const invites = useCollection<Omit<Invite, "id">>("invites", [where("gymId", "==", gym.id)], gym.id);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const pending = invites.data.find(i => i.role === "owner" && i.active && !i.usedBy && i.expiresAt.toMillis() > Date.now());

  const newLink = async () => {
    if (!user) return;
    try {
      const token = await createInvite({ gymId: gym.id, gymName: gym.name, user, role: "owner", templateId: null, single: true, label: "", days: 30 });
      setShareUrl(inviteUrl(token));
    } catch (err) { toast(`No se pudo crear el link (${(err as { code?: string }).code || "error"}).`); }
  };

  return (
    <div className="row gym-row">
      <span className="row-main"><b>{gym.name}</b>
        <small>
          {owners.data.length ? `Dueño: ${owners.data.map(o => o.name || o.email).join(", ")}` : <span className="warn-text">Esperando que entre el dueño</span>}
          {` · creado el ${dateOf(gym.createdAt)}`}
        </small></span>
      <span className="row-actions">
        {!owners.data.length && pending && <button className="mini" onClick={() => setShareUrl(inviteUrl(pending.id))}>Link del dueño</button>}
        <button className="mini" onClick={newLink}>{owners.data.length ? "Sumar otro dueño" : "Link nuevo"}</button>
      </span>
      {shareUrl && <div className="full-row"><ShareLink url={shareUrl} gymName={gym.name} role="owner" /></div>}
    </div>
  );
}
