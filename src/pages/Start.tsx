import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { orderBy } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { useCollection } from "../lib/hooks";
import { acceptInvite, createGym, getInvite, inviteProblem } from "../lib/data";
import type { Invite, UserGym } from "../types";
import { ROLE_LABEL } from "../types";
import { Empty, Loader, TopBar, useToast } from "../components/ui";

export function Login({ lead }: { lead?: string }) {
  const { signIn } = useAuth();
  return (
    <div className="wrap">
      <TopBar title="GymPlan" sub="Tu plan del gimnasio, siempre a mano" />
      <section className="hero-card">
        <h2>Entrá con tu cuenta</h2>
        <p>{lead || "Tu plan, tus pesos y tu progreso quedan guardados en tu cuenta de Google y los ves desde cualquier celular."}</p>
        <button className="btn primary big-btn" onClick={signIn}>Entrar con Google</button>
      </section>
    </div>
  );
}

export function Home() {
  const { user, signOut } = useAuth();
  const gyms = useCollection<UserGym>(user ? `users/${user.uid}/gyms` : null, [orderBy("joinedAt", "desc")], "joined");
  if (gyms.loading) return <Loader />;
  if (gyms.data.length === 1 && !sessionStorage.getItem("gp.stayHome")) return <Navigate to={`/g/${gyms.data[0].id}`} replace />;
  return (
    <div className="wrap">
      <TopBar title="GymPlan" sub={user?.displayName || user?.email} />
      {gyms.data.length ? (
        <section className="card">
          <h2>Tus gimnasios</h2>
          <div className="rows">
            {gyms.data.map(g => (
              <Link key={g.id} className="row-link" to={`/g/${g.id}`}>
                <span className="row-main"><b>{g.gymName}</b><small>{ROLE_LABEL[g.role]}</small></span><span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <Empty title="Todavía no estás en ningún gimnasio">
          <p>Si sos socio o profe, abrí el link de invitación que te mandó tu gimnasio.</p>
        </Empty>
      )}
      <section className="card subtle">
        <h2>¿Tenés un gimnasio?</h2>
        <p className="obs">Creá tu gimnasio, armá los planes y mandáselos a tus socios con un link.</p>
        <div className="links"><Link className="btn" to="/nuevo">Crear gimnasio</Link><button className="btn ghost" onClick={signOut}>Salir</button></div>
      </section>
    </div>
  );
}

export function NewGym() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    try { const id = await createGym(user, name); toast("Gimnasio creado"); nav(`/g/${id}`, { replace: true }); }
    catch (err) { toast(`No se pudo crear el gimnasio (${(err as { code?: string }).code || "error"}).`); setBusy(false); }
  };
  return (
    <div className="wrap">
      <TopBar title="Nuevo gimnasio" back="/" />
      <form className="card" onSubmit={submit}>
        <div className="field"><label htmlFor="gym-name">Nombre del gimnasio</label>
          <input id="gym-name" autoFocus placeholder="Ej: Roma Gym" value={name} onChange={e => setName(e.target.value)} /></div>
        <p className="obs">Vas a quedar como dueño. Después podés invitar a tus profes y socios.</p>
        <button className="btn primary" disabled={busy || !name.trim()}>{busy ? "Creando…" : "Crear gimnasio"}</button>
      </form>
    </div>
  );
}

export function Join() {
  const { token = "" } = useParams();
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [inv, setInv] = useState<Invite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    getInvite(token).then(setInv).catch(() => setInv(null));
  }, [user, token]);

  if (loading) return <Loader />;
  if (!user) return <Login lead="Te invitaron a un gimnasio en GymPlan. Entrá con tu cuenta de Google para ver la invitación." />;
  if (inv === undefined) return <Loader />;

  const problem = inviteProblem(inv);
  const join = async () => {
    if (!inv) return;
    setBusy(true);
    try { await acceptInvite(inv, user); toast(`¡Bienvenido a ${inv.gymName}!`); nav(`/g/${inv.gymId}`, { replace: true }); }
    catch (err) {
      const code = (err as { code?: string }).code || "";
      // Already a member: the create is refused, so just go in.
      if (code === "permission-denied") nav(`/g/${inv.gymId}`, { replace: true });
      else { toast(`No se pudo aceptar la invitación (${code || "error"}).`); setBusy(false); }
    }
  };
  return (
    <div className="wrap">
      <TopBar title="GymPlan" sub={user.email} />
      {problem || !inv ? (
        <Empty title="No se puede usar esta invitación"><p>{problem}</p><Link className="btn" to="/">Ir al inicio</Link></Empty>
      ) : (
        <section className="hero-card">
          <p className="eyebrow">Invitación</p>
          <h2>{inv.gymName}</h2>
          <p>Te invitaron a sumarte como <b>{ROLE_LABEL[inv.role].toLowerCase()}</b>{inv.label ? ` (${inv.label})` : ""}.
            {inv.role === "member" ? " Vas a poder ver tu plan, anotar tus pesos y ver tu progreso." : " Vas a poder armar planes y seguir a los socios."}</p>
          <p className="obs">Entrás como {user.displayName || user.email}.</p>
          <button className="btn primary big-btn" disabled={busy} onClick={join}>{busy ? "Uniéndote…" : "Unirme"}</button>
        </section>
      )}
    </div>
  );
}
