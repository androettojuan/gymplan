import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { orderBy } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { isSuperAdmin } from "../lib/admin";
import { useCollection } from "../lib/hooks";
import { acceptInvite, getInvite, inviteProblem } from "../lib/data";
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
  const superAdmin = isSuperAdmin(user);
  if (gyms.loading) return <Loader />;
  if (gyms.data.length === 1 && !superAdmin && !sessionStorage.getItem("gp.stayHome")) return <Navigate to={`/g/${gyms.data[0].id}`} replace />;
  return (
    <div className="wrap">
      <TopBar title="GymPlan" sub={user?.displayName || user?.email} />
      {superAdmin && (
        <Link className="card admin-card" to="/admin">
          <span className="row-main"><span className="eyebrow">Súper admin</span><b>Administrar gimnasios</b><small>Crear gimnasios y mandarle el link a cada dueño</small></span>
          <span aria-hidden="true">›</span>
        </Link>
      )}
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
      ) : !superAdmin && (
        <section className="hero-card invite-needed">
          <svg className="invite-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
          </svg>
          <h2>Necesitás la invitación de tu gimnasio</h2>
          <p>Para ver tu plan, pedile a tu gimnasio el link de invitación. Normalmente te lo mandan por <b>WhatsApp</b>.</p>
          <p className="obs">Cuando lo tengas, abrilo desde este celular y vas a entrar directo a tu plan con esta cuenta ({user?.email}).</p>
        </section>
      )}
      <div className="links"><button className="btn ghost" onClick={signOut}>Salir</button></div>
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
            {inv.role === "member" ? " Vas a poder ver tu plan, anotar tus pesos y ver tu progreso."
              : inv.role === "staff" ? " Vas a poder armar planes, invitar socios y seguir su progreso."
              : " Vas a administrar el gimnasio: armar planes, invitar socios y agregar a tus empleados."}</p>
          <p className="obs">Entrás como {user.displayName || user.email}.</p>
          <button className="btn primary big-btn" disabled={busy} onClick={join}>{busy ? "Uniéndote…" : "Unirme"}</button>
        </section>
      )}
    </div>
  );
}
