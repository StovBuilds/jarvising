// Echo trace (an A-scope): echo strength against range, revealed as the echoes return.
import { TAU, V_SHOWN, clamp } from "./constants";

export interface Contact { kind: "boat" | "seabed" | "wreck" | "mine"; R: number; s: number; w: number; tail?: boolean }
export interface PingRec { t0: number; contacts: Contact[]; seed: number }

const SCOPE_MAX = 420;

export function makeScope(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  function size() {
    const r = canvas.getBoundingClientRect();
    const pr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * pr));
    canvas.height = Math.max(1, Math.round(r.height * pr));
  }
  function draw(T: number, p: PingRec | null) {
    const W = canvas.width, Hs = canvas.height;
    if (W < 4 || Hs < 4 || !canvas.offsetParent) return;
    const pr = W / Math.max(1, canvas.clientWidth), padX = 8 * pr, base = Hs - 13 * pr, amp = Hs - 20 * pr;
    const X = (r: number) => padX + (r / SCOPE_MAX) * (W - 2 * padX);
    ctx.clearRect(0, 0, W, Hs);
    ctx.font = `${8.5 * pr}px "Azeret Mono", monospace`; ctx.textBaseline = "alphabetic";
    for (let r = 0; r <= 400; r += 100) {
      ctx.fillStyle = "rgba(143,230,238,0.10)"; ctx.fillRect(X(r), 4 * pr, 1, base - 4 * pr);
      ctx.fillStyle = "rgba(131,148,166,0.75)"; ctx.textAlign = r === 0 ? "left" : r === 400 ? "right" : "center";
      ctx.fillText(String(r), X(r), Hs - 3 * pr);
    }
    ctx.fillStyle = "rgba(143,230,238,0.2)"; ctx.fillRect(padX, base, W - 2 * padX, 1);
    if (!p) return;
    const rr = Math.min(SCOPE_MAX, (V_SHOWN * (T - p.t0)) / 2);
    const age = Math.max(0, T - p.t0 - (2 * SCOPE_MAX) / V_SHOWN);
    const alpha = 1 - clamp(age / 3, 0, 0.7);
    const f = (r: number) => {
      let v = 0.05 * (0.5 + 0.5 * Math.sin(r * 1.7 + p.seed) * Math.sin(r * 0.63 + p.seed * 2.1)) + Math.exp(-(r * r) / 12);
      for (const c of p.contacts) {
        if (c.tail) { if (r > c.R) v += c.s * Math.exp(-(r - c.R) / 45) * (0.7 + 0.3 * Math.sin(r * 0.9)); }
        else v += c.s * Math.exp(-((r - c.R) * (r - c.R)) / (c.w * c.w));
      }
      return Math.min(1.1, v);
    };
    ctx.lineJoin = "round";
    for (const [lw, col, blur] of [[3.2 * pr, "rgba(143,230,238,0.18)", 0], [1.3 * pr, "rgba(190,245,250,0.95)", 6 * pr]] as const) {
      ctx.beginPath();
      for (let r = 0; r <= rr; r += 1.2) { const x = X(r), y = base - f(r) * amp; if (r === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = col; ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.shadowColor = "rgba(143,230,238,0.9)"; ctx.shadowBlur = blur;
      ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = alpha;
    if (rr < SCOPE_MAX) { ctx.fillStyle = "#e3ebf1"; ctx.beginPath(); ctx.arc(X(rr), base - f(rr) * amp, 2 * pr, 0, TAU); ctx.fill(); }
    const tags: Partial<Record<Contact["kind"], string>> = { boat: "boat", wreck: "wreck", seabed: "seabed" };
    ctx.textAlign = "center";
    const placed: { x: number; y: number; w: number }[] = [];
    for (const c of [...p.contacts].sort((a) => (a.kind === "boat" ? -1 : 1))) {
      const tag = tags[c.kind];
      if (!tag || c.R > rr || c.R > SCOPE_MAX) continue;
      const x = X(c.R), w = ctx.measureText(tag).width + 6 * pr;
      let y = Math.max(10 * pr, base - Math.min(1.1, c.s + 0.05) * amp - 4 * pr);
      while (placed.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < 10 * pr)) y += 10 * pr;
      placed.push({ x, y, w });
      ctx.fillStyle = c.kind === "boat" ? "#ff6843" : "rgba(131,148,166,0.9)";
      ctx.fillText(tag, x, y);
    }
    ctx.globalAlpha = 1;
  }
  return { size, draw };
}
