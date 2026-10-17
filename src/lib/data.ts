import {
  collection, deleteDoc, doc, getDoc, Timestamp, updateDoc, writeBatch, setDoc,
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

// ---------- gyms ----------
export async function createGym(user: User, name: string) {
  const gymRef = doc(collection(db, "gyms"));
  const b = writeBatch(db);
  b.set(gymRef, { name: name.trim(), ownerUid: user.uid, createdAt: now() });
  b.set(doc(db, "gyms", gymRef.id, "members", user.uid), { role: "owner", ...profile(user), joinedAt: now(), inviteId: null, templateId: null });
  b.set(doc(db, "users", user.uid, "gyms", gymRef.id), { role: "owner", gymName: name.trim(), joinedAt: now() });
  await b.commit();
  return gymRef.id;
}

// ---------- invites ----------
export async function createInvite(opts: {
  gymId: string; gymName: string; user: User; role: "staff" | "member";
  templateId: string | null; single: boolean; label: string; days: number;
}) {
  const token = randomToken();
  const data: Omit<Invite, "id"> = {
    gymId: opts.gymId, gymName: opts.gymName, role: opts.role,
    templateId: opts.role === "member" ? opts.templateId : null,
    single: opts.role === "staff" ? true : opts.single,
    label: opts.label.trim(), usedBy: null, createdBy: opts.user.uid, createdAt: now(),
    expiresAt: Timestamp.fromMillis(now() + opts.days * 864e5), active: true,
  };
  await setDoc(doc(db, "invites", token), data);
  return token;
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

export const setInviteActive = (id: string, active: boolean) => updateDoc(doc(db, "invites", id), { active });

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
