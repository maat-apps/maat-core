import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app/globals.css";
import { AppRouter } from "./app/router";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
