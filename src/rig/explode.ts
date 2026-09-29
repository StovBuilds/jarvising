// The explode engine. Pure: takes the part tree and an amount, writes local
// positions. Every node with an ExplodeSpec moves within its own quarter of
// the slider (stage 1 → 0–0.25, … stage 4 → 0.75–1), eased, optionally
// lagged so siblings leave in waves. Children are parented under their node's
// Object3D, so a child's travel adds to its ancestors' automatically.
//
// `scope` (deep-dive pattern, brief scene 19): when set, only that subtree
// explodes and its stages are remapped so the slider's full travel is spent on
// the subtree (stage 3 → first half, stage 4 → second half, 1–2 ignored).

import * as THREE from "three";
import type { PartNode } from "./types";

const _dir = new THREE.Vector3();

const ease = (t: number) => t * t * (3 - 2 * t);

/** 0..1 progress of a node's own travel for a given slider amount. */
export function stageProgress(amount: number, stage: number, lag = 0, scoped = false): number {
  let w0: number, w1: number;
  if (scoped) {
    if (stage < 3) return amount > 0 ? 1 : 0;   // in a deep dive, coarse stages are already "done"
    w0 = (stage - 3) / 2; w1 = (stage - 2) / 2;
  } else {
    w0 = (stage - 1) / 4; w1 = stage / 4;
  }
  let t = (amount - w0) / (w1 - w0);
  if (lag > 0) t = (t - lag) / (1 - lag);
  return ease(Math.min(1, Math.max(0, t)));
}

/** Apply `amount` (0..1) to the tree rooted at `tops`. */
export function applyExplode(tops: PartNode[], amount: number, scope: PartNode | null = null): void {
  const visit = (n: PartNode, inScope: boolean) => {
    const active = scope ? inScope && n !== scope : true; // a dived product stays put; its parts leave it
    if (n.explode && active) {
      const t = stageProgress(amount, n.explode.stage, n.explode.lag ?? 0, !!scope);
      _dir.set(...n.explode.dir).normalize().multiplyScalar(n.explode.dist * t);
      n.object.position.copy(n.home).add(_dir);
    } else {
      n.object.position.copy(n.home);
    }
    for (const c of n.children) visit(c, inScope || c === scope);
  };
  for (const t of tops) visit(t, t === scope);
}

/** The slider's labelled stops (brief §25). */
export const EXPLODE_STOPS = [
  { at: 0, label: "Assembled" },
  { at: 0.25, label: "Case open" },
  { at: 0.5, label: "Systems" },
  { at: 0.75, label: "Components" },
  { at: 1, label: "Every piece" },
] as const;
