import {
  collection, deleteDoc, doc, getDoc, getDocs, query, Timestamp, updateDoc, where, writeBatch, setDoc,
  type DocumentReference,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../firebase";
import type { BodyEntry, ExerciseLog, Invite, Plan, Role } from "../types";
import { randomToken } from "./format";

const now = () => Date.now();
const profile = (u: User) => ({ name: u.displayName || "", email: u.email || "", photoURL: u.photoURL || "" });
const cleanPlan = (p: Plan): Plan => ({
  name: p.name.trim() || "Plan sin nombre",
  notes: p.notes.map(n => n.trim()).filter(Boolean),
  days: p.days.map(d => ({ title: d.title.trim() || "Día", exercises: d.exercises.filter(e => e.name.trim()) })),
  baseTemplateId: p.baseTemplateId ?? null,
});

// ---------- invites ----------
type InviteOpts = {
  gymId: string; gymName: string; user: User; role: Role;
  // null: the link never expires (it still works only once and can be deleted).
  templateId: string | null; single: boolean; label: string; days: number | null;
};
// The rules compare against a timestamp, so "never" is a date far ahead.
const NEVER = Date.UTC(2100, 0, 1);
export const neverExpires = (i: Pick<Invite, "expiresAt">) => i.expiresAt.toMillis() >= NEVER;
const inviteData = (o: InviteOpts): Omit<Invite, "id"> => ({
  gymId: o.gymId, gymName: o.gymName, role: o.role,
  templateId: o.role === "member" ? o.templateId : null,
  // Only member links can be shared with many people; staff and owner links work once.
  single: o.role === "member" ? o.single : true,
  label: o.label.trim(), usedBy: null, createdBy: o.user.uid, createdAt: now(),
  expiresAt: Timestamp.fromMillis(o.days == null ? NEVER : now() + o.days * 864e5), active: true,
});

export async function createInvite(opts: InviteOpts) {
  const token = randomToken();
  await setDoc(doc(db, "invites", token), inviteData(opts));
  return token;
}

// ---------- gyms (super admin) ----------
// Creates the gym and a one-time link for its owner, who joins like everyone else.
export async function createGymWithOwnerInvite(user: User, name: string, ownerLabel: string) {
  const gymRef = doc(collection(db, "gyms"));
  const token = randomToken();
  const b = writeBatch(db);
  b.set(gymRef, { name: name.trim(), createdAt: now(), createdBy: user.uid });
  b.set(doc(db, "invites", token), inviteData({
    gymId: gymRef.id, gymName: name.trim(), user, role: "owner", templateId: null, single: true, label: ownerLabel, days: 30,
  }));
  await b.commit();
  return { gymId: gymRef.id, token };
}

export const inviteUrl = (token: string) => `${location.origin}/join/${token}`;

export async function getInvite(token: string): Promise<Invite | null> {
  const s = await getDoc(doc(db, "invites", token));
  return s.exists() ? ({ id: s.id, ...s.data() } as Invite) : null;
}

export function inviteProblem(inv: Invite | null): string | null {
  if (!inv) return "Esta invitación no existe. Pedile al gimnasio un link nuevo.";
  if (!inv.active) return "Esta invitación fue desactivada. Pedile al gimnasio un link nuevo.";
  if (inv.expiresAt.toMillis() < Date.now()) return "Esta invitación venció. Pedile al gimnasio un link nuevo.";
  if (inv.single && inv.usedBy) return "Esta invitación ya fue usada. Pedile al gimnasio un link nuevo.";
  return null;
}

export async function acceptInvite(inv: Invite, user: User) {
  const b = writeBatch(db);
  b.set(doc(db, "gyms", inv.gymId, "members", user.uid), {
    role: inv.role, ...profile(user), joinedAt: now(), inviteId: inv.id, templateId: inv.templateId ?? null,
  });
  if (inv.single) b.update(doc(db, "invites", inv.id), { usedBy: user.uid });
  b.set(doc(db, "users", user.uid, "gyms", inv.gymId), { role: inv.role, gymName: inv.gymName, joinedAt: now() });
  await b.commit();
}

export const deleteInvite = (id: string) => deleteDoc(doc(db, "invites", id));

export const setGymActive = (gymId: string, active: boolean) => updateDoc(doc(db, "gyms", gymId), { active });

// Deletes a gym and everything in it: people, their notes, plans, history and links.
// Firestore doesn't remove subcollections with their parent, so every document is listed and deleted.
export async function deleteGymCompletely(gymId: string, onProgress?: (done: number) => void) {
  const refs: DocumentReference[] = [];
  const all = async (path: string) => (await getDocs(collection(db, path))).docs;
  for (const m of await all(`gyms/${gymId}/members`)) {
    for (const d of await all(`${m.ref.path}/logs`)) refs.push(d.ref);
    for (const d of await all(`${m.ref.path}/body`)) refs.push(d.ref);
    refs.push(doc(db, "users", m.id, "gyms", gymId), m.ref);
  }
  for (const sub of ["templates", "plans"]) {
    for (const t of await all(`gyms/${gymId}/${sub}`)) {
      for (const v of await all(`${t.ref.path}/versions`)) refs.push(v.ref);
      refs.push(t.ref);
    }
  }
  for (const d of await all(`gyms/${gymId}/exercises`)) refs.push(d.ref);
  for (const d of (await getDocs(query(collection(db, "invites"), where("gymId", "==", gymId)))).docs) refs.push(d.ref);
  refs.push(doc(db, "gyms", gymId));
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach(r => b.delete(r));
    await b.commit();
    onProgress?.(Math.min(i + 400, refs.length));
  }
  return refs.length;
}

// ---------- plans ----------
export async function saveTemplate(gymId: string, tplId: string | null, plan: Plan, uid: string) {
  const ref = tplId ? doc(db, "gyms", gymId, "templates", tplId) : doc(collection(db, "gyms", gymId, "templates"));
  const data = { ...cleanPlan(plan), updatedAt: now(), updatedBy: uid };
  const b = writeBatch(db);
  b.set(ref, data);
  b.set(doc(collection(ref, "versions")), data);
  await b.commit();
  return ref.id;
}

export const deleteTemplate = (gymId: string, tplId: string) => deleteDoc(doc(db, "gyms", gymId, "templates", tplId));

export async function savePersonalPlan(gymId: string, memberUid: string, plan: Plan, uid: string) {
  const ref = doc(db, "gyms", gymId, "plans", memberUid);
  const data = { ...cleanPlan(plan), updatedAt: now(), updatedBy: uid };
  const b = writeBatch(db);
  b.set(ref, data);
  b.set(doc(collection(ref, "versions")), data);
  await b.commit();
}

export const deletePersonalPlan = (gymId: string, memberUid: string) => deleteDoc(doc(db, "gyms", gymId, "plans", memberUid));

// ---------- members ----------
export const assignTemplate = (gymId: string, memberUid: string, templateId: string | null) =>
  updateDoc(doc(db, "gyms", gymId, "members", memberUid), { templateId });

export const changeRole = (gymId: string, memberUid: string, role: Exclude<Role, "owner">) =>
  updateDoc(doc(db, "gyms", gymId, "members", memberUid), { role });

export const removeMember = (gymId: string, memberUid: string) => deleteDoc(doc(db, "gyms", gymId, "members", memberUid));

// ---------- member's own notes ----------
// Firestore applies these locally at once and syncs later, so callers don't wait for the server.
export const saveLog = (gymId: string, uid: string, exKey: string, log: ExerciseLog) =>
  setDoc(doc(db, "gyms", gymId, "members", uid, "logs", exKey), log);

export const deleteLog = (gymId: string, uid: string, exKey: string) =>
  deleteDoc(doc(db, "gyms", gymId, "members", uid, "logs", exKey));

export const saveBody = (gymId: string, uid: string, entries: BodyEntry[]) =>
  setDoc(doc(db, "gyms", gymId, "members", uid, "body", "main"), { entries });
