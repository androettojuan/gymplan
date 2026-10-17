import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isSuperAdmin } from "../lib/admin";
import { useCollection } from "../lib/hooks";

// Account info and sign out. "Mis gimnasios" only appears when there is somewhere else to go.
export function AccountCard() {
  const { user, signOut } = useAuth();
  const gyms = useCollection(user ? `users/${user.uid}/gyms` : null);
  const superAdmin = isSuperAdmin(user);
  const stayHome = () => sessionStorage.setItem("gp.stayHome", "1");
  return (
    <section className="card subtle">
      <h2>Tu cuenta</h2>
      <p className="obs">{user?.displayName}{user?.email ? ` · ${user.email}` : ""}</p>
      <div className="links">
        {gyms.data.length > 1 && <Link className="btn ghost" to="/" onClick={stayHome}>Mis gimnasios</Link>}
        {superAdmin && <Link className="btn ghost" to="/admin">Administrar gimnasios</Link>}
        <button className="btn ghost" onClick={signOut}>Salir</button>
      </div>
    </section>
  );
}
