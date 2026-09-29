// Story vs brand: one scene, two content layers. Brand mode is a PLACEHOLDER
// PARTNER skin (a fill-in-later campaign configuration) so the page shows how a
// sponsored version would read without impersonating anyone. The default text
// names no real company, and the copy it wraps names no products at all.
//
// Preview without a deploy:
//   /projects/rig/live/?mode=brand&partner=Some%20Partner&headline=…&accent=1d4ed8

import type { Mode } from "./types";

export interface Identity {
  mode: Mode;
  /** Brand mode only: the partner's display name (placeholder by default). */
  partner: string;
  /** Brand mode only: the campaign headline shown on the hero + end card. */
  headline: string;
  /** UI accent — hover outlines, the slider, the rail, emissive accents. */
  accent: string;
  /** Brand mode only: the required disclosure line. */
  disclosure: string;
  /** Brand mode only: the CTA label on the end card (no link in V1). */
  cta: string;
}

export const STORY: Identity = {
  mode: "story",
  partner: "",
  headline: "",
  accent: "#e8a33a",
  disclosure: "",
  cta: "",
};

export const BRAND_SKIN: Identity = {
  mode: "brand",
  partner: "PARTNER NAME",
  headline: "Performance is a system.",
  accent: "#2f6bff",
  disclosure: "Sponsored showcase · placeholder partner · no real company or product is named here",
  cta: "EXPLORE THE BUILD",
};

const TEXT_KEYS = ["partner", "headline", "disclosure", "cta"] as const;

export function resolveIdentity(search: string): Identity {
  const q = new URLSearchParams(search);
  const brand = q.get("mode") === "brand";
  const out: Identity = { ...(brand ? BRAND_SKIN : STORY) };
  if (brand) {
    for (const k of TEXT_KEYS) {
      const v = q.get(k)?.trim();
      if (v) out[k] = v.slice(0, 80);
    }
  }
  const accent = q.get("accent")?.trim().replace(/^#/, "");
  if (accent && /^[0-9a-f]{6}$/i.test(accent)) out.accent = `#${accent.toLowerCase()}`;
  return out;
}
