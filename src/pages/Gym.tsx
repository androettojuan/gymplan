import { useMemo, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCollection, useDoc } from "../lib/hooks";
import { deleteLog, deletePersonalPlan, saveBody, saveLog, savePersonalPlan } from "../lib/data";
import type { BodyEntry, ExerciseLog, Gym as GymT, Member, Plan } from "../types";
import { WEEKDAYS, MONTHS } from "../lib/format";
import { BottomTabs, ConfirmButton, Empty, Loader, TopBar, usePersistentState, useToast } from "../components/ui";
import { BodyCard, LiftsCard, TrainingView, type Logs } from "../components/Training";
import { MemberDetail, PersonalPlanPage, StaffHome, TemplatePage } from "./Staff";
import { AccountCard } from "../components/AccountCard";
import { PlanEditor, blankPlan, buildLibrary } from "../components/PlanEditor";

const todayLabel = () => { const d = new Date(); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export function GymRoutes() {
  const { gymId = "" } = useParams();
  const { user } = useAuth();
  const gym = useDoc<Omit<GymT, "id">>(user ? `gyms/${gymId}` : null);
  const me = useDoc<Omit<Member, "uid">>(user ? `gyms/${gymId}/members/${user.uid}` : null);

  if (gym.loading || me.loading) return <Loader />;
  if (!me.data || !gym.data) {
    return (
      <div className="wrap">
        <TopBar title="GymPlan" back="/" />
        <Empty title="No sos parte de este gimnasio">
          <p>Puede que te hayan dado de baja o que el link sea de otro gimnasio. Pedile al gimnasio una invitación nueva.</p>
          <Link className="btn" to="/">Ir al inicio</Link>
        </Empty>
      </div>
    );
  }
  const g = { ...gym.data, id: gymId } as GymT;
  if (g.active === false) {
    return (
      <div className="wrap">
        <TopBar title={g.name} />
        <Empty title="Este gimnasio está desactivado">
          <p>Por ahora no se puede usar GymPlan en {g.name}. Tus datos quedan guardados y vas a volver a verlos cuando se reactive.</p>
          <p>Si tenés dudas, consultá en el gimnasio.</p>
        </Empty>
        <AccountCard />
      </div>
    );
  }
  if (me.data.role === "member") return (
    <Routes>
      <Route index element={<MemberApp gym={g} />} />
      <Route path="mi-plan" element={<OwnPlanPage gym={g} />} />
    </Routes>
  );
  return (
    <Routes>
      <Route index element={<StaffHome gym={g} role={me.data.role} />} />
      <Route path="plan/:tplId" element={<TemplatePage gym={g} />} />
      <Route path="socio/:uid" element={<MemberDetail gym={g} role={me.data.role} />} />
      <Route path="socio/:uid/plan" element={<PersonalPlanPage gym={g} />} />
    </Routes>
  );
}

// The member's plan: a personal plan if the coach made one, otherwise the assigned template.
export function useMemberPlan(gymId: string, uid: string | null, templateId: string | null | undefined) {
  const personal = useDoc<Plan>(uid ? `gyms/${gymId}/plans/${uid}` : null);
  const tpl = useDoc<Plan>(!personal.loading && !personal.data && templateId ? `gyms/${gymId}/templates/${templateId}` : null);
  return { plan: (personal.data || tpl.data) as Plan | null, personal: !!personal.data, loading: personal.loading || tpl.loading };
}

export function useMemberNotes(gymId: string, uid: string | null) {
  const logs = useCollection<ExerciseLog>(uid ? `gyms/${gymId}/members/${uid}/logs` : null);
  const body = useDoc<{ entries: BodyEntry[] }>(uid ? `gyms/${gymId}/members/${uid}/body/main` : null);
  const map: Logs = {};
  for (const l of logs.data) map[l.id] = l;
  return { logs: map, body: body.data?.entries || [], loading: logs.loading || body.loading };
}

function MemberApp({ gym }: { gym: GymT }) {
  const { user } = useAuth();
  const toast = useToast();
  const uid = user!.uid;
  const me = useDoc<Omit<Member, "uid">>(`gyms/${gym.id}/members/${uid}`);
  const { plan, loading } = useMemberPlan(gym.id, uid, me.data?.templateId);
  const notes = useMemberNotes(gym.id, uid);
  const [tab, setTab] = usePersistentState<"train" | "progress">(`gp.${gym.id}.tab`, "train");
  const fail = (e: { code?: string }) => toast(`No se pudo guardar (${e.code || "error"}).`);

  if (loading || notes.loading) return <Loader />;
  return (
    <div className="wrap has-tabs">
      <TopBar title={gym.name} sub={plan?.name} right={<span className="today num">{todayLabel()}</span>} />
      {tab === "train" ? (
        plan ? (
          <>
            <TrainingView plan={plan} logs={notes.logs} storageKey={`gp.${gym.id}`}
              onSaveLog={(ex, entries) => { saveLog(gym.id, uid, ex.exKey, { name: ex.name, entries }).catch(fail); toast(`Guardado: ${ex.name.slice(0, 30)}`); }}
              onDeleteLog={ex => { deleteLog(gym.id, uid, ex.exKey).catch(fail); toast("Registro borrado"); }} />
            <div className="links"><Link className="btn ghost" to={`/g/${gym.id}/mi-plan`}>Editar mi plan</Link></div>
          </>
        ) : (
          <Empty title="Todavía no tenés plan">
            <p>Cuando tu profe te asigne uno, aparece acá automáticamente. Mientras tanto podés armar el tuyo: ponés los ejercicios, las series y las repeticiones de cada día.</p>
            <Link className="btn primary" to={`/g/${gym.id}/mi-plan`}>Armar mi plan</Link>
          </Empty>
        )
      ) : (
        <>
          <BodyCard entries={notes.body} onSave={entries => { saveBody(gym.id, uid, entries).catch(fail); toast("Peso guardado"); }} />
          <LiftsCard plan={plan} logs={notes.logs} emptyText="Cuando anotes pesos en tus ejercicios, acá vas a ver cómo van subiendo." />
          <AccountCard />
        </>
      )}
      <BottomTabs tabs={[["train", "Entrenar"], ["progress", "Progreso"]]} value={tab} onChange={setTab} />
    </div>
  );
}

// The member writes their own plan by hand (or from a PDF). It's the same personal plan a coach can make,
// so whoever saves last wins and the coach sees it in the member's page.
function OwnPlanPage({ gym }: { gym: GymT }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const uid = user!.uid;
  const me = useDoc<Omit<Member, "uid">>(`gyms/${gym.id}/members/${uid}`);
  const { plan, personal, loading } = useMemberPlan(gym.id, uid, me.data?.templateId);
  const library = useMemo(() => buildLibrary(plan ? [plan] : []), [plan]);
  const [busy, setBusy] = useState(false);
  const back = `/g/${gym.id}`;
  if (me.loading || loading) return <Loader />;
  const initial: Plan = plan ? { ...plan, baseTemplateId: plan.baseTemplateId ?? me.data?.templateId ?? null } : { ...blankPlan(), name: "Mi plan" };
  const save = async (p: Plan) => {
    setBusy(true);
    try { await savePersonalPlan(gym.id, uid, p, uid); toast("Plan guardado"); nav(back); }
    catch (err) { toast(`No se pudo guardar (${(err as { code?: string }).code || "error"}).`); setBusy(false); }
  };
  return (
    <div className="wrap">
      <TopBar title={plan ? "Editar mi plan" : "Armar mi plan"} sub="Ejercicios, series y repeticiones de cada día" back={back} />
      <PlanEditor initial={initial} library={library} saveLabel="Guardar plan" busy={busy} onSave={save} onCancel={() => nav(back)} />
      {personal && me.data?.templateId && (
        <section className="card subtle">
          <h2>Volver al plan del gimnasio</h2>
          <p className="obs">Descarta tus cambios y vuelve a mostrar el plan que te asignó tu profe. Tus pesos anotados no se borran.</p>
          <ConfirmButton confirmText="Tocá de nuevo para volver" onConfirm={() => deletePersonalPlan(gym.id, uid).then(() => { toast("Volviste al plan del gimnasio"); nav(back); }).catch(() => toast("No se pudo cambiar."))}>Usar el plan del gimnasio</ConfirmButton>
        </section>
      )}
    </div>
  );
}
