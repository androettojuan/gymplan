import type { Timestamp } from "firebase/firestore";

export type Role = "owner" | "staff" | "member";

export interface PlanExercise {
  exKey: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  obs: string;
  video: string;
}

export interface PlanDay {
  title: string;
  exercises: PlanExercise[];
}

export interface Plan {
  name: string;
  notes: string[];
  days: PlanDay[];
  updatedAt?: number;
  updatedBy?: string;
  baseTemplateId?: string | null;
}

export interface Template extends Plan {
  id: string;
}

export interface Gym {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
}

export interface Member {
  uid: string;
  role: Role;
  name: string;
  email: string;
  photoURL: string;
  joinedAt: number;
  inviteId?: string | null;
  templateId?: string | null;
}

export interface Invite {
  id: string;
  gymId: string;
  gymName: string;
  role: Role;
  templateId: string | null;
  single: boolean;
  label: string;
  usedBy?: string | null;
  createdBy: string;
  createdAt: number;
  expiresAt: Timestamp;
  active: boolean;
}

export interface LogEntry {
  d: string;
  w: number | null;
  r: string;
  n: string;
}

export interface ExerciseLog {
  name: string;
  entries: LogEntry[];
}

export interface BodyEntry {
  d: string;
  w: number;
}

export interface UserGym {
  gymId: string;
  role: Role;
  gymName: string;
  joinedAt: number;
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Dueño", staff: "Empleado", member: "Socio" };
