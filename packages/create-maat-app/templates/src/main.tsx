import "./app/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "./app/register-service-worker";
import { AppRouter } from "./app/router";

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
