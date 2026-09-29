import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Rig from "./Rig";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Rig />
  </StrictMode>,
);
