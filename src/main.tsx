import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// Pick up new versions on their own: check when the app opens and every hour, and reload once the new one is ready.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
