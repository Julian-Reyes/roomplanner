import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initStore } from "./state/persist";
import { App } from "./App";
import "./styles.css";

initStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
