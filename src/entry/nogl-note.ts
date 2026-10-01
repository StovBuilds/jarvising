// Entry pages: if this browser cannot run the live piece's 3D (WebGL switched off,
// common on managed work laptops), say so under the "Open …" door before the reader
// clicks through, and say what they will get instead. Without JS nothing changes:
// the page reads in full and the door still links to the piece.
import { hasWebGL } from "../shared/webgl";

const INSTEAD: Record<string, string> = {
  enigma: "The piece will show its chapter list instead.",
  cortex: "The map will open in its flat 2D mode.",
  rig: "The piece will show the machine as a list instead.",
  submarine: "The piece will show a still version.",
};

const door = document.querySelector<HTMLAnchorElement>("a.door");
const slug = location.pathname.split("/")[2] ?? "";
if (door && !hasWebGL()) {
  const note = document.createElement("p");
  note.className = "door-nogl";
  note.setAttribute("role", "note");
  note.textContent = `3D is switched off in this browser. ${INSTEAD[slug] ?? "The piece will show a simpler version."}`;
  Object.assign(note.style, {
    margin: "12px 0 0",
    padding: "10px 14px",
    borderLeft: "3px solid var(--accent, #B5451B)",
    background: "var(--paper-deep, #EFE8D9)",
    borderRadius: "0 10px 10px 0",
    color: "var(--ink-soft, #4E5259)",
    font: "400 14px/1.5 'Inter', system-ui, sans-serif",
  });
  door.insertAdjacentElement("afterend", note);
}
