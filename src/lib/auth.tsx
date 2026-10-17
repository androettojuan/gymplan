import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, getRedirectResult, type User } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

interface AuthState { user: User | null; loading: boolean; signIn: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthState | null>(null);

export function authError(code: string) {
  if (code === "auth/unauthorized-domain") return "Este sitio no está autorizado en Firebase (Authentication → Dominios autorizados).";
  if (code === "auth/operation-not-allowed") return "Falta activar el ingreso con Google en Firebase.";
  if (code === "auth/network-request-failed") return "Sin conexión. Probá de nuevo cuando tengas señal.";
  return `No se pudo entrar (${code || "error"}).`;
}

export function AuthProvider({ children, onError }: { children: ReactNode; onError: (msg: string) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getRedirectResult(auth).catch(e => onError(authError(e.code)));
    return onAuthStateChanged(auth, u => { setUser(u); setLoading(false); });
  }, [onError]);

  const signIn = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) {
      const code = (e as { code?: string }).code || "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, googleProvider);
      else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") onError(authError(code));
    }
  };
  const signOut = () => fbSignOut(auth);
  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
