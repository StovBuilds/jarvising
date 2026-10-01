// The still version of Below the Layer, for browsers that cannot run the 3D scene:
// WebGL switched off (common on managed work laptops), WebGL1 only (three r185 needs
// WebGL2), or a renderer that failed to start or stopped mid-run.
//
// Three-free on purpose: ./main.ts shows this without ever loading the 3D bundle.
// The layer and pressure copy is lifted from the piece's own info card (#info in the
// live page), so the two can never drift apart.
import { COMPS } from "./comps";
import { NOGL_FIX, NOGL_WHY } from "../shared/webgl";

export type FallbackReason = "no-webgl" | "crashed";

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

let shown = false;

export function showFallback(reason: FallbackReason = "no-webgl") {
  if (shown) return;
  shown = true;
  const doc = document.documentElement;
  doc.classList.add("nogl");
  document.body.dataset.nogl = reason;
  document.getElementById("loader")?.classList.add("gone");

  const still = h("main", "still");
  still.id = "still";
  still.setAttribute("aria-labelledby", "stillTitle");

  const fig = h("figure", "still-hero");
  const img = h("img");
  img.src = "/projects/submarine/hero.jpg";
  img.width = 1600;
  img.height = 900;
  img.alt = "A T-class submarine seen from below at night, lit by faint shafts of light: the escort's ping is passing along its hull in a pale band, a red echo is spreading from the hull, and the ping's edge sweeps across the seabed and a wreck far beneath.";
  fig.append(img, h("figcaption", undefined, "A frame from the live piece"));

  const body = h("div", "still-body");
  const kicker = h("p", "still-kicker", "Entry 004 · the still version");
  const title = h("h1");
  title.id = "stillTitle";
  title.append("Below ", h("b", undefined, "the layer"));

  const why = h("p", "still-why");
  why.append(
    h("strong", undefined, reason === "crashed" ? "The 3D scene stopped. " : "Why you're seeing this. "),
    reason === "crashed" ? "Its graphics stopped running in this browser, so here is the still version. " : `${NOGL_WHY} `,
    NOGL_FIX,
  );

  const idea = h("div", "still-idea");
  idea.append(
    h("p", undefined, "A British T-class submarine of the Second World War, while an enemy escort on the surface hunts it with sound."),
    h("p", undefined, "In the live piece you take the boat down under the layer of cold water and watch the escort's ping lose it, then open the hull up to see the compartments inside."),
  );

  const comps = h("section", "still-sec");
  comps.append(h("h2", undefined, "Opened up, bow to stern"));
  const ol = h("ol", "still-comps");
  for (const c of COMPS) ol.append(h("li", undefined, c.name));
  comps.append(ol);

  // "The layer" and "The pressure" from the info card, heading plus its paragraphs
  const card = document.querySelector("#info .card");
  const science = h("section", "still-sec");
  if (card) {
    let take = false;
    for (const el of Array.from(card.children)) {
      if (el.tagName === "H3") take = /layer|pressure/i.test(el.textContent ?? "");
      else if (el.tagName !== "P" || el.classList.contains("fine")) take = false;
      if (take) science.append(el.cloneNode(true));
    }
  }

  const links = h("p", "still-links");
  const back = h("a", "back", "← Read the entry");
  back.href = "/projects/submarine/";
  const sources = h("a", "still-src", "Sources");
  sources.href = "/projects/submarine/#sources";
  links.append(back, sources);

  body.append(kicker, title, why, idea, comps);
  if (science.childElementCount) body.append(science);
  body.append(links);
  still.append(fig, body);
  document.body.append(still);
}
