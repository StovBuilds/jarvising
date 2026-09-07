import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Enigma from "./Enigma";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Enigma />
  </StrictMode>,
);
