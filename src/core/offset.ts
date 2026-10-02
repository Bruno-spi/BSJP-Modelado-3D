// Compensación de kerf por desplazamiento de contorno.
//
// Esquema del motor: la geometría de dientes/ranuras se diseña en su tamaño
// NOMINAL (la holgura `fit` ya está incorporada). El kerf se compensa UNA sola
// vez aquí, desplazando el centro de corte k/2 hacia el DESPERDICIO:
//   - contorno exterior  -> hacia afuera (+k/2)
//   - hueco (agujero)    -> hacia adentro del hueco (+k/2 del lado del desperdicio)
// Así la pieza terminada recupera su tamaño nominal. NO volver a compensar en
// LightBurn: dejar "kerf offset" en 0 allí si se exporta con kerf ya aplicado.

import type { Contour, Point } from "./types";

/** Área con signo (CCW > 0 en ejes matemáticos). */
export function signedArea(poly: Contour): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(p: Point): number {
  return Math.hypot(p.x, p.y);
}

/** Intersección de dos rectas dadas por punto+dirección. null si son paralelas. */
function intersect(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const den = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
}

/**
 * Desplaza un contorno cerrado una distancia `delta` hacia AFUERA (si
 * outward=true) o hacia ADENTRO (false), según su orientación real.
 * Pensado para polígonos rectilíneos; usa intersección de aristas desplazadas.
 */
export function offsetContour(poly: Contour, delta: number, outward: boolean): Contour {
  if (delta === 0 || poly.length < 3) return poly.map((p) => ({ ...p }));
  const orient = signedArea(poly) >= 0 ? 1 : -1; // +1 CCW, -1 CW
  const sign = (outward ? 1 : -1) * delta;
  const n = poly.length;

  // Aristas desplazadas: cada una como (punto base desplazado, dirección).
  const shifted: Array<{ p: Point; d: Point }> = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const d = sub(b, a);
    const l = len(d);
    if (l < 1e-9) continue;
    const dir = { x: d.x / l, y: d.y / l };
    // Normal exterior: para CCW es la derecha (dy,-dx); para CW la izquierda.
    const normal =
      orient > 0 ? { x: dir.y, y: -dir.x } : { x: -dir.y, y: dir.x };
    shifted.push({
      p: { x: a.x + normal.x * sign, y: a.y + normal.y * sign },
      d: dir,
    });
  }

  // Nuevos vértices = intersección de aristas desplazadas consecutivas.
  const out: Point[] = [];
  const m = shifted.length;
  for (let i = 0; i < m; i++) {
    const prev = shifted[(i - 1 + m) % m];
    const cur = shifted[i];
    const x = intersect(prev.p, prev.d, cur.p, cur.d);
    if (x) out.push(x);
    else out.push({ ...cur.p }); // aristas paralelas: usar el punto desplazado
  }
  return out;
}

/** Aplica kerf a una pieza: exterior hacia afuera, huecos hacia adentro. */
export function applyKerf(outline: Contour, holes: Contour[], kerf: number): {
  outline: Contour;
  holes: Contour[];
} {
  if (!(kerf > 0)) return { outline, holes };
  const half = kerf / 2;
  // offsetContour es independiente de la orientación: outward=true AGRANDA el
  // área encerrada, outward=false la ACHICA. El desperdicio del contorno
  // exterior está afuera (agrandar) y el del hueco está adentro (achicar).
  return {
    outline: offsetContour(outline, half, true),
    holes: holes.map((h) => offsetContour(h, half, false)),
  };
}
