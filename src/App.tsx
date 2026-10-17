import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Loader, ToastProvider } from "./components/ui";
import { Home, Join, Login, NewGym } from "./pages/Start";
import { GymRoutes } from "./pages/Gym";

function Gate({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return user ? children : <Login />;
}

export default function App() {
  return (
    <ToastProvider>
      {toast => (
        <AuthProvider onError={toast}>
          <BrowserRouter>
            <Routes>
              <Route path="/join/:token" element={<Join />} />
              <Route path="/" element={<Gate><Home /></Gate>} />
              <Route path="/nuevo" element={<Gate><NewGym /></Gate>} />
              <Route path="/g/:gymId/*" element={<Gate><GymRoutes /></Gate>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      )}
    </ToastProvider>
  );
}
