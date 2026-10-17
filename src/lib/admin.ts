import type { User } from "firebase/auth";

// Who can create gyms. The rules enforce this too (isSuper in firestore.rules): keep both lists in sync.
export const SUPER_ADMINS = ["juan.androetto36@gmail.com"];

export const isSuperAdmin = (u: User | null) => !!u && u.emailVerified && SUPER_ADMINS.includes(u.email || "");
