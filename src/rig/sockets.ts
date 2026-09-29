// The PC socket vocabulary (master brief §23). Every physical interface in the
// build, named semantically, with what provides it, what currently occupies it
// and what else would fit. Positions are the real ones from the layout in
// layout notes in types.ts, in millimetres in the machine frame.
//
// This is the reusable half of the "reusable parts library" idea: the geometry
// of this build is specific to it, but the vocabulary is not. It is what makes
// the compatibility graph and the build configurator (brief §43, §45) possible
// later, and what a reusable parts library would be organised around — so it is
// written as data with no dependency on the meshes.

import type { PartId } from "./ids";

export type SocketKind =
  | "cpu" | "cooler" | "memory" | "expansion" | "storage"
  | "power" | "fan" | "radiator" | "header" | "mount";

export interface Socket {
  id: string;
  label: string;
  kind: SocketKind;
  /** The part that carries this socket. */
  provider: PartId;
  /** What is plugged into it in this build, if anything. */
  occupant?: PartId;
  /** Position in the machine frame, millimetres. */
  at: [number, number, number];
  /** Plain-English note on what the socket takes. */
  accepts: string;
}

export const SOCKETS: Socket[] = [
  // ── the processor and its cooler ──────────────────────────────────────
  { id: "cpu-lga", label: "processor socket", kind: "cpu", provider: "cpu-socket", occupant: "cpu", at: [-91, 454, -214.5], accepts: "A desktop processor made for this socket" },
  { id: "cpu-cooler-mount", label: "cooler mount", kind: "cooler", provider: "motherboard", occupant: "aio", at: [-86, 454, -214.5], accepts: "Any cooler with a bracket for this socket, air or liquid" },

  // ── memory: four slots, two filled, which is the point of the pairing ──
  { id: "dimm-a1", label: "DIMM A1", kind: "memory", provider: "dimm-slots", at: [-93, 449, -152.5], accepts: "One DDR5 module (leave empty on a two-module build)" },
  { id: "dimm-a2", label: "DIMM A2", kind: "memory", provider: "dimm-slots", occupant: "dimm-a", at: [-93, 449, -142], accepts: "One DDR5 module" },
  { id: "dimm-b1", label: "DIMM B1", kind: "memory", provider: "dimm-slots", at: [-93, 449, -131.5], accepts: "One DDR5 module (leave empty on a two-module build)" },
  { id: "dimm-b2", label: "DIMM B2", kind: "memory", provider: "dimm-slots", occupant: "dimm-b", at: [-93, 449, -121], accepts: "One DDR5 module" },

  // ── expansion ─────────────────────────────────────────────────────────
  { id: "pcie-x16-1", label: "PCIe 5.0 x16 slot 1", kind: "expansion", provider: "pcie-slot-1", occupant: "gpu", at: [-92, 354, -257], accepts: "A graphics card or any x16 expansion card" },
  { id: "pcie-x16-2", label: "PCIe x16 slot 2", kind: "expansion", provider: "pcie-slot-2", at: [-92, 293, -257], accepts: "A second expansion card, if the graphics card leaves room" },

  // ── storage: one of five filled ───────────────────────────────────────
  { id: "m2-1", label: "M.2 slot 1", kind: "storage", provider: "motherboard", occupant: "ssd", at: [-93, 394, -250], accepts: "One M.2 2280 NVMe drive" },
  ...([2, 3, 4, 5] as const).map((n): Socket => ({
    id: `m2-${n}`, label: `M.2 slot ${n}`, kind: "storage", provider: "motherboard",
    at: [-93, 300 - (n - 2) * 30, -220], accepts: "One M.2 2280 NVMe drive",
  })),

  // ── power ─────────────────────────────────────────────────────────────
  { id: "atx-24pin", label: "24-pin board power", kind: "power", provider: "atx-24pin-socket", occupant: "cable-24pin", at: [-85, 455, -42.5], accepts: "The main ATX power lead" },
  { id: "eps-8pin-a", label: "CPU power A", kind: "power", provider: "eps-sockets", occupant: "cable-eps-a", at: [-85, 541, -292], accepts: "An 8-pin EPS processor power lead" },
  { id: "eps-8pin-b", label: "CPU power B", kind: "power", provider: "eps-sockets", occupant: "cable-eps-b", at: [-85, 541, -278], accepts: "A second 8-pin EPS lead for sustained load" },
  { id: "gpu-16pin", label: "Graphics power", kind: "power", provider: "gpu-power-connector", occupant: "cable-gpu-16pin", at: [38, 347, -130], accepts: "A 12V-2x6 (16-pin) graphics power lead" },

  // ── cooling mounts ────────────────────────────────────────────────────
  { id: "case-radiator-top", label: "Top radiator mount", kind: "radiator", provider: "case-top-frame", occupant: "aio-radiator", at: [-30, 594, -20], accepts: "A 360 or 420 mm radiator" },
  { id: "case-radiator-front", label: "Front radiator mount", kind: "radiator", provider: "case-frame", at: [-20, 325, 284.5], accepts: "A 360 or 420 mm radiator, in place of the front fans" },
  { id: "case-fan-front-1", label: "Front fan 1", kind: "fan", provider: "case-frame", occupant: "fan-front-1", at: [-20, 175, 284.5], accepts: "A 120 or 140 mm intake fan" },
  { id: "case-fan-front-2", label: "Front fan 2", kind: "fan", provider: "case-frame", occupant: "fan-front-2", at: [-20, 325, 284.5], accepts: "A 120 or 140 mm intake fan" },
  { id: "case-fan-front-3", label: "Front fan 3", kind: "fan", provider: "case-frame", occupant: "fan-front-3", at: [-20, 475, 284.5], accepts: "A 120 or 140 mm intake fan" },
  { id: "case-fan-rear", label: "Rear fan", kind: "fan", provider: "case-rear", occupant: "fan-rear", at: [30, 470, -304.5], accepts: "A 120 or 140 mm exhaust fan" },

  // ── chassis mounts and the front panel ────────────────────────────────
  { id: "case-motherboard", label: "Motherboard tray", kind: "mount", provider: "case-tray", occupant: "motherboard", at: [-99, 400, -170], accepts: "An E-ATX, ATX, micro-ATX or mini-ITX board" },
  { id: "case-psu", label: "Power supply bay", kind: "mount", provider: "case-floor", occupant: "psu", at: [-50, 40, -220], accepts: "An ATX power supply up to 220 mm long" },
  { id: "front-io", label: "Front panel header", kind: "header", provider: "motherboard", occupant: "cable-front-io", at: [-93, 250, -70], accepts: "The case's power button, USB and audio leads" },
];

const byOccupant = new Map<string, Socket>();
const byProvider = new Map<string, Socket[]>();
for (const s of SOCKETS) {
  if (s.occupant) byOccupant.set(s.occupant, s);
  byProvider.set(s.provider, [...(byProvider.get(s.provider) ?? []), s]);
}

/** The socket a part is plugged into, if any. */
export const socketOf = (id: string): Socket | undefined => byOccupant.get(id);

/** The sockets a part carries, and how many are still free. */
export function socketsOn(id: string): { total: number; free: number; kinds: string[] } | undefined {
  const list = byProvider.get(id);
  if (!list || list.length === 0) return undefined;
  const free = list.filter((s) => !s.occupant).length;
  const kinds = [...new Set(list.map((s) => s.kind))];
  return { total: list.length, free, kinds };
}
