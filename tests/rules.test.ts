import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

// Runs against the Firestore emulator: npm run test:rules
let env: RulesTestEnvironment;
const GYM = "gym1";
const ts = (msFromNow: number) => firebase.firestore.Timestamp.fromMillis(Date.now() + msFromNow);
const SUPER = "juan.androetto36@gmail.com";
const db = (uid?: string, email = `${uid}@test.com`, verified = true) =>
  (uid ? env.authenticatedContext(uid, { email, email_verified: verified }) : env.unauthenticatedContext()).firestore();
const superDb = () => db("super", SUPER);
const member = (role: string, extra: object = {}) => ({ role, name: "", email: "", photoURL: "", joinedAt: 1, inviteId: null, templateId: null, ...extra });
const invite = (extra: object = {}) => ({
  gymId: GYM, gymName: "Gym", role: "member", templateId: "tplA", single: true, label: "", usedBy: null,
  createdBy: "owner", createdAt: 1, expiresAt: ts(864e5), active: true, ...extra,
});
const plan = { name: "P", notes: [], days: [] };

function join(uid: string, token: string, role: string, templateId: string | null, single: boolean) {
  const d = db(uid);
  const b = d.batch();
  b.set(d.doc(`gyms/${GYM}/members/${uid}`), member(role, { inviteId: token, templateId }));
  if (single) b.update(d.doc(`invites/${token}`), { usedBy: uid });
  b.set(d.doc(`users/${uid}/gyms/${GYM}`), { role, gymName: "Gym", joinedAt: 1 });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "gymplan-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8180 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore();
    await f.doc(`gyms/${GYM}`).set({ name: "Gym", createdAt: 1, createdBy: "super" });
    await f.doc(`gyms/${GYM}/members/owner`).set(member("owner"));
    await f.doc(`gyms/${GYM}/members/coach`).set(member("staff"));
    await f.doc(`gyms/${GYM}/members/ana`).set(member("member", { templateId: "tplA" }));
    await f.doc(`gyms/${GYM}/members/beto`).set(member("member", { templateId: "tplB" }));
    await f.doc(`gyms/${GYM}/templates/tplA`).set(plan);
    await f.doc(`gyms/${GYM}/templates/tplB`).set(plan);
    await f.doc(`gyms/${GYM}/members/beto/logs/press`).set({ name: "Press", entries: [] });
    await f.doc("invites/single1").set(invite());
    await f.doc("invites/general1").set(invite({ single: false, templateId: null }));
    await f.doc("invites/expired1").set(invite({ expiresAt: ts(-1000) }));
    await f.doc("invites/off1").set(invite({ active: false }));
    await f.doc("invites/staff1").set(invite({ role: "staff", templateId: null }));
    await f.doc("invites/owner1").set(invite({ role: "owner", templateId: null, createdBy: "super" }));
  });
});

describe("súper admin", () => {
  it("solo el súper admin crea gimnasios, junto con el link del dueño", async () => {
    const d = superDb();
    const b = d.batch();
    b.set(d.doc("gyms/g2"), { name: "Otro", createdAt: 1, createdBy: "super" });
    b.set(d.doc("invites/own2"), invite({ gymId: "g2", role: "owner", templateId: null, createdBy: "super" }));
    await assertSucceeds(b.commit());
  });
  it("un usuario común no puede crear gimnasios", async () => {
    await assertFails(db("nuevo").doc("gyms/g3").set({ name: "X", createdAt: 1, createdBy: "nuevo" }));
  });
  it("el email del súper admin tiene que estar verificado", async () => {
    await assertFails(db("falso", SUPER, false).doc("gyms/g4").set({ name: "X", createdAt: 1, createdBy: "falso" }));
  });
  it("solo el súper admin ve la lista de gimnasios", async () => {
    await assertSucceeds(superDb().collection("gyms").get());
    await assertFails(db("owner").collection("gyms").get());
  });
  it("solo el súper admin crea links de dueño", async () => {
    await assertSucceeds(superDb().doc("invites/o2").set(invite({ role: "owner", templateId: null, createdBy: "super" })));
    await assertFails(db("owner").doc("invites/o3").set(invite({ role: "owner", templateId: null, createdBy: "owner" })));
  });
  it("con el link del dueño se entra como dueño, una sola vez", async () => {
    await assertSucceeds(join("marcelo", "owner1", "owner", null, true));
    await assertFails(join("otro", "owner1", "owner", null, true));
  });
});

describe("desactivar y borrar gimnasios", () => {
  const off = () => env.withSecurityRulesDisabled(ctx => ctx.firestore().doc(`gyms/${GYM}`).update({ active: false }));
  it("solo el súper admin desactiva un gimnasio; el dueño solo le cambia el nombre", async () => {
    await assertFails(db("owner").doc(`gyms/${GYM}`).update({ active: false }));
    await assertSucceeds(db("owner").doc(`gyms/${GYM}`).update({ name: "Nuevo nombre" }));
    await assertSucceeds(superDb().doc(`gyms/${GYM}`).update({ active: false }));
  });
  it("con el gimnasio desactivado nadie usa planes ni pesos", async () => {
    await off();
    await assertFails(db("ana").doc(`gyms/${GYM}/templates/tplA`).get());
    await assertFails(db("ana").doc(`gyms/${GYM}/members/ana/logs/press`).set({ name: "Press", entries: [] }));
    await assertFails(db("coach").doc(`gyms/${GYM}/templates/tplA`).set(plan));
    await assertFails(db("coach").collection(`gyms/${GYM}/members`).where("role", "==", "member").get());
  });
  it("con el gimnasio desactivado sus miembros igual ven que existe (para el aviso)", async () => {
    await off();
    await assertSucceeds(db("ana").doc(`gyms/${GYM}`).get());
  });
  it("con el gimnasio desactivado no se puede entrar con un link", async () => {
    await off();
    await assertFails(join("carla", "general1", "member", null, false));
  });
  it("al reactivarlo todo vuelve a funcionar", async () => {
    await off();
    await assertSucceeds(superDb().doc(`gyms/${GYM}`).update({ active: true }));
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/templates/tplA`).get());
  });
  it("solo el súper admin borra un gimnasio y todo lo que tiene adentro", async () => {
    await assertFails(db("owner").doc(`gyms/${GYM}`).delete());
    await assertFails(db("owner").doc(`gyms/${GYM}/members/beto/logs/press`).delete());
    await assertSucceeds(superDb().collection(`gyms/${GYM}/members/beto/logs`).get());
    await assertSucceeds(superDb().doc(`gyms/${GYM}/members/beto/logs/press`).delete());
    await assertSucceeds(superDb().doc(`gyms/${GYM}/templates/tplA`).delete());
    await assertSucceeds(superDb().doc("users/ana/gyms/gym1").delete());
    await assertSucceeds(superDb().doc(`gyms/${GYM}`).delete());
  });
});

describe("gimnasios", () => {
  it("nadie se puede hacer dueño sin el link del dueño", async () => {
    await assertFails(db("intruso").doc(`gyms/${GYM}/members/intruso`).set(member("owner")));
    await assertFails(join("intruso", "single1", "owner", "tplA", true));
  });
  it("un desconocido no puede leer el gimnasio", async () => {
    await assertFails(db("intruso").doc(`gyms/${GYM}`).get());
    await assertFails(db().doc(`gyms/${GYM}`).get());
  });
  it("un socio puede leer el gimnasio", async () => {
    await assertSucceeds(db("ana").doc(`gyms/${GYM}`).get());
  });
});

describe("invitaciones", () => {
  it("el profe crea invitaciones de socio; el socio no", async () => {
    await assertSucceeds(db("coach").doc("invites/n1").set(invite({ createdBy: "coach" })));
    await assertFails(db("ana").doc("invites/n2").set(invite({ createdBy: "ana" })));
  });
  it("solo el dueño agrega empleados", async () => {
    await assertSucceeds(db("owner").doc("invites/s1").set(invite({ role: "staff", createdBy: "owner", templateId: null })));
    await assertFails(db("coach").doc("invites/s2").set(invite({ role: "staff", createdBy: "coach", templateId: null })));
  });
  it("una invitación de un uso funciona una sola vez", async () => {
    await assertSucceeds(join("carla", "single1", "member", "tplA", true));
    await assertFails(join("dani", "single1", "member", "tplA", true));
  });
  it("no se puede usar una invitación de un uso sin marcarla como usada", async () => {
    await assertFails(join("carla", "single1", "member", "tplA", false));
  });
  it("no se puede pedir otro rol u otro plan que el de la invitación", async () => {
    await assertFails(join("carla", "single1", "staff", "tplA", true));
    await assertFails(join("carla", "single1", "member", "tplB", true));
  });
  it("las invitaciones vencidas o desactivadas no sirven", async () => {
    await assertFails(join("carla", "expired1", "member", "tplA", true));
    await assertFails(join("carla", "off1", "member", "tplA", true));
  });
  it("el link general sirve para varias personas", async () => {
    await assertSucceeds(join("carla", "general1", "member", null, false));
    await assertSucceeds(join("dani", "general1", "member", null, false));
  });
  it("con una invitación de profe se entra como profe", async () => {
    await assertSucceeds(join("nuevoprofe", "staff1", "staff", null, true));
  });
  it("el profe puede listar las invitaciones del gimnasio; un socio no", async () => {
    await assertSucceeds(db("coach").collection("invites").where("gymId", "==", GYM).get());
    await assertFails(db("ana").collection("invites").where("gymId", "==", GYM).get());
  });
  it("cualquiera con sesión puede abrir una invitación por su link", async () => {
    await assertSucceeds(db("desconocido").doc("invites/single1").get());
    await assertFails(db().doc("invites/single1").get());
  });
});

describe("planes", () => {
  it("el socio ve solo el plan que tiene asignado", async () => {
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/templates/tplA`).get());
    await assertFails(db("ana").doc(`gyms/${GYM}/templates/tplB`).get());
  });
  it("el socio no puede editar planes; el profe sí", async () => {
    await assertFails(db("ana").doc(`gyms/${GYM}/templates/tplA`).set(plan));
    await assertSucceeds(db("coach").doc(`gyms/${GYM}/templates/tplA`).set(plan));
  });
  it("el plan personalizado lo escribe el profe y lo lee solo ese socio", async () => {
    await assertSucceeds(db("coach").doc(`gyms/${GYM}/plans/ana`).set(plan));
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/plans/ana`).get());
    await assertFails(db("beto").doc(`gyms/${GYM}/plans/ana`).get());
  });
  it("el socio arma su propio plan, pero no el de otro", async () => {
    const own = { ...plan, updatedBy: "ana" };
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/plans/ana`).set(own));
    await assertSucceeds(db("ana").collection(`gyms/${GYM}/plans/ana/versions`).add(own));
    await assertFails(db("ana").doc(`gyms/${GYM}/plans/ana`).set({ ...plan, updatedBy: "coach" }));
    await assertFails(db("ana").doc(`gyms/${GYM}/plans/beto`).set(own));
    await assertFails(db("ana").collection(`gyms/${GYM}/plans/ana/versions`).get());
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/plans/ana`).delete());
    await assertFails(db("ana").doc(`gyms/${GYM}/plans/beto`).delete());
  });
  it("el profe asigna planes; el socio no se puede cambiar el plan", async () => {
    await assertSucceeds(db("coach").doc(`gyms/${GYM}/members/ana`).update({ templateId: "tplB" }));
    await assertFails(db("ana").doc(`gyms/${GYM}/members/ana`).update({ templateId: "tplA" }));
  });
});

describe("pesos y progreso", () => {
  it("el socio anota sus pesos y los de nadie más", async () => {
    await assertSucceeds(db("ana").doc(`gyms/${GYM}/members/ana/logs/press`).set({ name: "Press", entries: [] }));
    await assertFails(db("ana").doc(`gyms/${GYM}/members/beto/logs/press`).set({ name: "Press", entries: [] }));
  });
  it("un socio no ve los pesos de otro; el profe sí", async () => {
    await assertFails(db("ana").doc(`gyms/${GYM}/members/beto/logs/press`).get());
    await assertSucceeds(db("coach").doc(`gyms/${GYM}/members/beto/logs/press`).get());
  });
  it("el profe no puede escribir los pesos del socio", async () => {
    await assertFails(db("coach").doc(`gyms/${GYM}/members/beto/logs/press`).set({ name: "Press", entries: [] }));
  });
  it("un socio no ve la lista de socios", async () => {
    await assertFails(db("ana").collection(`gyms/${GYM}/members`).where("role", "==", "member").get());
    await assertSucceeds(db("coach").collection(`gyms/${GYM}/members`).where("role", "==", "member").get());
  });
});

describe("roles", () => {
  it("nadie se sube el rol a sí mismo", async () => {
    await assertFails(db("ana").doc(`gyms/${GYM}/members/ana`).update({ role: "staff" }));
    await assertFails(db("coach").doc(`gyms/${GYM}/members/coach`).update({ role: "owner" }));
  });
  it("el dueño puede hacer profe a un socio, pero no crear otro dueño", async () => {
    await assertSucceeds(db("owner").doc(`gyms/${GYM}/members/ana`).update({ role: "staff" }));
    await assertFails(db("owner").doc(`gyms/${GYM}/members/beto`).update({ role: "owner" }));
  });
  it("el profe da de baja socios pero no al dueño ni a otros profes", async () => {
    await assertSucceeds(db("coach").doc(`gyms/${GYM}/members/ana`).delete());
    await assertFails(db("coach").doc(`gyms/${GYM}/members/owner`).delete());
  });
  it("el dueño no se puede dar de baja a sí mismo", async () => {
    await assertFails(db("owner").doc(`gyms/${GYM}/members/owner`).delete());
  });
  it("el dueño elimina links de empleado; un empleado no", async () => {
    await assertFails(db("coach").doc("invites/staff1").delete());
    await assertSucceeds(db("owner").doc("invites/staff1").delete());
  });
  it("un empleado elimina links de socio; un socio no", async () => {
    await assertFails(db("ana").doc("invites/single1").delete());
    await assertSucceeds(db("coach").doc("invites/single1").delete());
  });
  it("un link de empleado sin vencimiento sigue sirviendo", async () => {
    await env.withSecurityRulesDisabled(ctx => ctx.firestore().doc("invites/staffNever").set(
      invite({ role: "staff", templateId: null, expiresAt: firebase.firestore.Timestamp.fromMillis(Date.UTC(2100, 0, 1)) })));
    await assertSucceeds(join("profe2", "staffNever", "staff", null, true));
  });
  it("el dueño quita empleados", async () => {
    await assertSucceeds(db("owner").doc(`gyms/${GYM}/members/coach`).delete());
  });
});
