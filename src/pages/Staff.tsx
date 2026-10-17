import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { where } from "firebase/firestore";
import { useAuth } from "../lib/auth";
import { useCollection, useDoc } from "../lib/hooks";
import {
  assignTemplate, changeRole, createInvite, deletePersonalPlan, deleteTemplate, inviteUrl,
  removeMember, savePersonalPlan, saveTemplate, setInviteActive,
} from "../lib/data";
import type { Gym, Invite, Member, Plan, Role, Template } from "../types";
import { ROLE_LABEL } from "../types";
import { dayLabel, fmtDate, today } from "../lib/format";
import { BottomTabs, ConfirmButton, Empty, Loader, TopBar, usePersistentState, useToast } from "../components/ui";
import { PlanEditor, blankPlan, buildLibrary } from "../components/PlanEditor";
import { BodyCard, LiftsCard } from "../components/Training";
import { useMemberNotes, useMemberPlan } from "./Gym";

type StaffTab = "members" | "plans" | "invite" | "team";
const dateOf = (ms?: number) => (ms ? fmtDate(new Date(ms).toISOString().slice(0, 10)) : "");
const exCount = (p: Plan) => p.days.reduce((n, d) => n + d.exercises.length, 0);

export function StaffHome({ gym, role }: { gym: Gym; role: Role }) {
  const { user, signOut } = useAuth();
  const [tab, setTab] = usePersistentState<StaffTab>(`gp.${gym.id}.staffTab`, "members");
  const members = useCollection<Omit<Member, "uid">>(`gyms/${gym.id}/members`, [where("role", "==", "member")], "members");
  const templates = useCollection<Omit<Template, "id">>(`gyms/${gym.id}/templates`);
  const tplName = (id?: string | null) => templates.data.find(t => t.id === id)?.name;

  return (
    <div className="wrap has-tabs">
      <TopBar title={gym.name} sub={`${ROLE_LABEL[role]} · ${user?.displayName || user?.email}`} />
      {tab === "members" && <MembersTab gym={gym} members={members.data} loading={members.loading} tplName={tplName} />}
      {tab === "plans" && <PlansTab gym={gym} templates={templates.data} loading={templates.loading} members={members.data} />}
      {tab === "invite" && <InviteTab gym={gym} role={role} templates={templates.data} />}
      {tab === "team" && <TeamTab gym={gym} role={role} />}
      <section className="card subtle">
        <div className="links">
          <Link className="btn ghost" to="/" onClick={() => sessionStorage.setItem("gp.stayHome", "1")}>Mis gimnasios</Link>
          <button className="btn ghost" onClick={signOut}>Salir</button>
        </div>
      </section>
      <BottomTabs<StaffTab> tabs={[["members", "Socios"], ["plans", "Planes"], ["invite", "Invitar"], ["team", "Equipo"]]} value={tab} onChange={setTab} />
    </div>
  );
}

function MembersTab({ gym, members, loading, tplName }: {
  gym: Gym; members: (Omit<Member, "uid"> & { id: string })[]; loading: boolean; tplName: (id?: string | null) => string | undefined;
}) {
  const [q, setQ] = useState("");
  if (loading) return <Loader />;
  const list = members
    .filter(m => !q || `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!members.length) return (
    <Empty title="Todavía no hay socios">
      <p>Creá un plan en la pestaña <b>Planes</b> y después mandale a cada socio un link desde <b>Invitar</b>.</p>
    </Empty>
  );
  return (
    <section className="card">
      <div className="card-head"><h2>Socios</h2><span className="count num">{members.length}</span></div>
      <input className="search" type="search" placeholder="Buscar por nombre o email" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar socio" />
      <div className="rows">
        {list.map(m => (
          <Link key={m.id} className="row-link" to={`/g/${gym.id}/socio/${m.id}`}>
            {m.photoURL ? <img className="avatar" src={m.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(m.name || "?")[0]}</span>}
            <span className="row-main"><b>{m.name || m.email}</b>
              <small>{tplName(m.templateId) ? `Plan: ${tplName(m.templateId)}` : <span className="warn-text">Sin plan asignado</span>}</small></span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PlansTab({ gym, templates, loading, members }: {
  gym: Gym; templates: (Omit<Template, "id"> & { id: string })[]; loading: boolean; members: { templateId?: string | null }[];
}) {
  if (loading) return <Loader />;
  return (
    <section className="card">
      <div className="card-head"><h2>Planes</h2><Link className="btn primary" to={`/g/${gym.id}/plan/nuevo`}>+ Nuevo plan</Link></div>
      {!templates.length ? (
        <p className="obs">Armá tu primer plan desde cero o importá el PDF que usan hoy. Después se lo asignás a los socios.</p>
      ) : (
        <div className="rows">
          {templates.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t => {
            const n = members.filter(m => m.templateId === t.id).length;
            return (
              <Link key={t.id} className="row-link" to={`/g/${gym.id}/plan/${t.id}`}>
                <span className="row-main"><b>{t.name}</b>
                  <small>{t.days.length} días · {exCount(t)} ejercicios · {n} {n === 1 ? "socio" : "socios"}{t.updatedAt ? ` · editado el ${dateOf(t.updatedAt)}` : ""}</small></span>
                <span aria-hidden="true">›</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ShareLink({ url, gymName, role }: { url: string; gymName: string; role: "staff" | "member" }) {
  const toast = useToast();
  const msg = role === "member"
    ? `Hola! Te comparto tu plan de entrenamiento de ${gymName}. Entrá con este link: ${url}`
    : `Hola! Te invito a sumarte como profe de ${gymName} en GymPlan: ${url}`;
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
        <button className="btn" onClick={copy}>Copiar link</button>
        {"share" in navigator && <button className="btn ghost" onClick={share}>Compartir…</button>}
      </div>
    </div>
  );
}

function InviteTab({ gym, role, templates }: { gym: Gym; role: Role; templates: (Omit<Template, "id"> & { id: string })[] }) {
  const { user } = useAuth();
  const toast = useToast();
  const [kind, setKind] = useState<"member" | "staff">("member");
  const [single, setSingle] = useState(true);
  const [label, setLabel] = useState("");
  const [tplId, setTplId] = useState("");
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; role: "staff" | "member" } | null>(null);
  const invites = useCollection<Omit<Invite, "id">>("invites", [where("gymId", "==", gym.id)], gym.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const token = await createInvite({ gymId: gym.id, gymName: gym.name, user, role: kind, templateId: tplId || null, single: kind === "staff" || single, label, days });
      setCreated({ url: inviteUrl(token), role: kind });
      setLabel("");
    } catch (err) { toast(`No se pudo crear la invitación (${(err as { code?: string }).code || "error"}).`); }
    setBusy(false);
  };

  const status = (i: Omit<Invite, "id">) =>
    !i.active ? "Desactivada" : i.expiresAt.toMillis() < Date.now() ? "Vencida" : i.single && i.usedBy ? "Usada" : "Activa";
  const list = invites.data.slice().sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <form className="card" onSubmit={submit}>
        <h2>Invitar</h2>
        {role === "owner" && (
          <div className="seg" role="radiogroup" aria-label="Tipo de invitación">
            <button type="button" role="radio" aria-checked={kind === "member"} onClick={() => setKind("member")}>Socio</button>
            <button type="button" role="radio" aria-checked={kind === "staff"} onClick={() => setKind("staff")}>Profe</button>
          </div>
        )}
        <div className="field"><label htmlFor="inv-label">{kind === "member" ? "Para quién (opcional)" : "Nombre del profe (opcional)"}</label>
          <input id="inv-label" placeholder="Ej: Martina López" value={label} onChange={e => setLabel(e.target.value)} /></div>
        {kind === "member" && <>
          <div className="field"><label htmlFor="inv-plan">Plan</label>
            <select id="inv-plan" value={tplId} onChange={e => setTplId(e.target.value)}>
              <option value="">Sin plan (lo asigno después)</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <div className="seg" role="radiogroup" aria-label="Uso del link">
            <button type="button" role="radio" aria-checked={single} onClick={() => setSingle(true)}>Para una persona</button>
            <button type="button" role="radio" aria-checked={!single} onClick={() => setSingle(false)}>Link general</button>
          </div>
          <p className="obs">{single ? "El link sirve una sola vez." : "Cualquiera con el link se puede sumar como socio. Útil para compartir en el grupo del gimnasio."}</p>
        </>}
        {kind === "staff" && <p className="obs">El profe va a poder armar planes, invitar socios y ver su progreso. El link sirve una sola vez.</p>}
        <div className="field"><label htmlFor="inv-days">Vence en</label>
          <select id="inv-days" value={days} onChange={e => setDays(+e.target.value)}>
            <option value={7}>7 días</option><option value={30}>30 días</option><option value={90}>90 días</option><option value={365}>1 año</option>
          </select></div>
        <button className="btn primary" disabled={busy}>{busy ? "Creando…" : "Crear link"}</button>
        {created && <ShareLink url={created.url} gymName={gym.name} role={created.role} />}
      </form>

      <section className="card">
        <h2>Links creados</h2>
        {!list.length ? <p className="obs">Todavía no creaste invitaciones.</p> : (
          <div className="rows">
            {list.map(i => {
              const st = status(i);
              return (
                <div key={i.id} className="row">
                  <span className="row-main"><b>{i.label || (i.single ? "Sin nombre" : "Link general")}</b>
                    <small>{ROLE_LABEL[i.role]} · {i.single ? "un uso" : "general"} · creado el {dateOf(i.createdAt)}</small></span>
                  <span className={`pill ${st === "Activa" ? "ok" : ""}`}>{st}</span>
                  {st === "Activa" && <>
                    <button className="mini" onClick={() => setCreated({ url: inviteUrl(i.id), role: i.role })}>Compartir</button>
                    <ConfirmButton className="mini" confirmText="¿Desactivar?" onConfirm={() => setInviteActive(i.id, false).catch(() => toast("No se pudo desactivar."))}>Desactivar</ConfirmButton>
                  </>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function TeamTab({ gym, role }: { gym: Gym; role: Role }) {
  const { user } = useAuth();
  const toast = useToast();
  const team = useCollection<Omit<Member, "uid">>(`gyms/${gym.id}/members`, [where("role", "in", ["owner", "staff"])], "team");
  if (team.loading) return <Loader />;
  return (
    <section className="card">
      <h2>Equipo</h2>
      <div className="rows">
        {team.data.sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.name.localeCompare(b.name))).map(m => (
          <div key={m.id} className="row">
            {m.photoURL ? <img className="avatar" src={m.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{(m.name || "?")[0]}</span>}
            <span className="row-main"><b>{m.name || m.email}{m.id === user?.uid ? " (vos)" : ""}</b><small>{ROLE_LABEL[m.role]} · {m.email}</small></span>
            {role === "owner" && m.role === "staff" && (
              <ConfirmButton className="mini" confirmText="¿Quitar?" onConfirm={() => removeMember(gym.id, m.id).then(() => toast("Profe quitado")).catch(() => toast("No se pudo quitar."))}>Quitar</ConfirmButton>
            )}
          </div>
        ))}
      </div>
      {role === "owner" && <p className="obs">Para sumar un profe, creá una invitación de tipo <b>Profe</b> en la pestaña Invitar.</p>}
    </section>
  );
}

// ---------- plan templates ----------
export function TemplatePage({ gym }: { gym: Gym }) {
  const { tplId = "nuevo" } = useParams();
  const isNew = tplId === "nuevo";
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const tpl = useDoc<Plan>(isNew ? null : `gyms/${gym.id}/templates/${tplId}`);
  const all = useCollection<Plan>(`gyms/${gym.id}/templates`);
  const assigned = useCollection<Member>(`gyms/${gym.id}/members`, [where("templateId", "==", tplId)], tplId);
  const library = useMemo(() => buildLibrary(all.data), [all.data]);
  const [busy, setBusy] = useState(false);
  const back = `/g/${gym.id}`;

  if (tpl.loading || all.loading) return <Loader />;
  if (!isNew && !tpl.data) return <div className="wrap"><TopBar title="Plan" back={back} /><Empty title="Este plan ya no existe" /></div>;

  const save = async (p: Plan) => {
    if (!user) return;
    setBusy(true);
    try { await saveTemplate(gym.id, isNew ? null : tplId, p, user.uid); toast(isNew ? "Plan creado" : "Plan actualizado. Los socios ya ven los cambios."); nav(back); }
    catch (err) { toast(`No se pudo guardar (${(err as { code?: string }).code || "error"}).`); setBusy(false); }
  };
  const n = assigned.data.length;
  return (
    <div className="wrap">
      <TopBar title={isNew ? "Nuevo plan" : tpl.data!.name} sub={isNew ? "Armalo o importá un PDF" : `${n} ${n === 1 ? "socio usa" : "socios usan"} este plan`} back={back} />
      <PlanEditor initial={tpl.data || blankPlan()} library={library} saveLabel={isNew ? "Crear plan" : "Guardar cambios"} busy={busy} onSave={save} onCancel={() => nav(back)} />
      {!isNew && (
        <section className="card subtle">
          <h2>Borrar plan</h2>
          <p className="obs">{n ? `${n} ${n === 1 ? "socio se queda" : "socios se quedan"} sin plan hasta que les asignes otro. Sus pesos anotados no se borran.` : "Ningún socio usa este plan."}</p>
          <ConfirmButton confirmText="Tocá de nuevo para borrar" onConfirm={() => deleteTemplate(gym.id, tplId).then(() => { toast("Plan borrado"); nav(back); }).catch(() => toast("No se pudo borrar."))}>Borrar plan</ConfirmButton>
        </section>
      )}
    </div>
  );
}

// ---------- one member ----------
export function MemberDetail({ gym, role }: { gym: Gym; role: Role }) {
  const { uid = "" } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const member = useDoc<Omit<Member, "uid">>(`gyms/${gym.id}/members/${uid}`);
  const templates = useCollection<Omit<Template, "id">>(`gyms/${gym.id}/templates`);
  const { plan, personal, loading } = useMemberPlan(gym.id, uid, member.data?.templateId);
  const notes = useMemberNotes(gym.id, uid);
  const back = `/g/${gym.id}`;

  if (member.loading || loading || notes.loading) return <Loader />;
  const m = member.data;
  if (!m) return <div className="wrap"><TopBar title="Socio" back={back} /><Empty title="Este socio ya no está en el gimnasio" /></div>;
  const lastActivity = Object.values(notes.logs).flatMap(l => l.entries.map(e => e.d)).sort().pop();

  return (
    <div className="wrap">
      <TopBar title={m.name || m.email} sub={`${m.email} · desde el ${dateOf(m.joinedAt)}`} back={back} />
      <section className="card">
        <h2>Plan</h2>
        <div className="field"><label htmlFor="assign">Plan asignado</label>
          <select id="assign" value={m.templateId || ""} onChange={e => assignTemplate(gym.id, uid, e.target.value || null).then(() => toast("Plan asignado")).catch(() => toast("No se pudo asignar."))}>
            <option value="">Sin plan</option>
            {templates.data.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
        {personal
          ? <p className="obs"><span className="pill ok">Personalizado</span> Tiene un plan propio basado en la plantilla; los cambios en la plantilla no le llegan.</p>
          : <p className="obs">Ve la plantilla tal cual. Si necesita ajustes solo para él o ella, personalizalo.</p>}
        <div className="links">
          <Link className="btn" to={`/g/${gym.id}/socio/${uid}/plan`}>{personal ? "Editar plan personalizado" : "Personalizar plan"}</Link>
          {personal && <ConfirmButton className="btn ghost" confirmText="¿Volver a la plantilla?" onConfirm={() => deletePersonalPlan(gym.id, uid).then(() => toast("Volvió a la plantilla")).catch(() => toast("No se pudo cambiar."))}>Usar la plantilla</ConfirmButton>}
        </div>
        {plan && <ul className="plan-summary">{plan.days.map((d, i) => <li key={i}><b>{dayLabel(d.title)}</b> · {d.exercises.map(e => e.name).join(", ")}</li>)}</ul>}
      </section>
      <section className="card">
        <div className="card-head"><h2>Actividad</h2>{lastActivity && <span className="obs">Último registro: {lastActivity === today() ? "hoy" : fmtDate(lastActivity)}</span>}</div>
      </section>
      <BodyCard entries={notes.body} />
      <LiftsCard plan={plan} logs={notes.logs} emptyText="Todavía no anotó pesos." />
      <section className="card subtle">
        <h2>Dar de baja</h2>
        <p className="obs">Deja de ver su plan. Si vuelve, mandale una invitación nueva.</p>
        <div className="links">
          {role === "owner" && <ConfirmButton className="btn ghost" confirmText="¿Hacerlo profe?" onConfirm={() => changeRole(gym.id, uid, "staff").then(() => toast("Ahora es profe")).catch(() => toast("No se pudo cambiar."))}>Hacerlo profe</ConfirmButton>}
          <ConfirmButton confirmText="Tocá de nuevo para dar de baja" onConfirm={() => removeMember(gym.id, uid).then(() => { toast("Socio dado de baja"); nav(back); }).catch(() => toast("No se pudo dar de baja."))}>Dar de baja</ConfirmButton>
        </div>
      </section>
    </div>
  );
}

export function PersonalPlanPage({ gym }: { gym: Gym }) {
  const { uid = "" } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const member = useDoc<Omit<Member, "uid">>(`gyms/${gym.id}/members/${uid}`);
  const { plan, loading } = useMemberPlan(gym.id, uid, member.data?.templateId);
  const all = useCollection<Plan>(`gyms/${gym.id}/templates`);
  const library = useMemo(() => buildLibrary(all.data), [all.data]);
  const [busy, setBusy] = useState(false);
  const back = `/g/${gym.id}/socio/${uid}`;
  if (member.loading || loading || all.loading) return <Loader />;
  const initial: Plan = plan ? { ...plan, baseTemplateId: plan.baseTemplateId ?? member.data?.templateId ?? null } : blankPlan();
  const save = async (p: Plan) => {
    if (!user) return;
    setBusy(true);
    try { await savePersonalPlan(gym.id, uid, p, user.uid); toast("Plan personalizado guardado"); nav(back); }
    catch (err) { toast(`No se pudo guardar (${(err as { code?: string }).code || "error"}).`); setBusy(false); }
  };
  return (
    <div className="wrap">
      <TopBar title="Plan personalizado" sub={member.data?.name} back={back} />
      <PlanEditor initial={initial} library={library} saveLabel="Guardar plan" busy={busy} onSave={save} onCancel={() => nav(back)} />
    </div>
  );
}
