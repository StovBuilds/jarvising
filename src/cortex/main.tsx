import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Cortex from "./Cortex";
import { installProbe } from "./probe";
import "./cortex.css";

const probe = new URLSearchParams(window.location.search).get("probe") === "1";

if (probe) installProbe();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Cortex />
  </StrictMode>,
);
