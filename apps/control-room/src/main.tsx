import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
// oxlint-disable-next-line import/no-unassigned-import -- CSS is an intentional Vite entrypoint side effect.
import "./index.css";

registerSW({ immediate: true });

const root = document.getElementById("root");
if (root === null) throw new Error("missing #root application mount");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
