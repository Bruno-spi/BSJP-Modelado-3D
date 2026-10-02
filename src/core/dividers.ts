// Divisores internos con encastre de media madera.
//
// - Divisor X (parte el ancho): panel en el plano YZ, abarca la profundidad
//   interior y la altura; se une a las paredes frente/trasera con espigas
//   (tenones) que entran en mortajas (huecos) de esas paredes.
// - Divisor Y (parte la profundidad): panel en el plano XZ, se une a las
//   paredes laterales.
// - En cada cruce, media madera: el divisor X tiene una ranura desde ARRIBA
//   hasta la mitad y el divisor Y una ranura desde ABAJO hasta la mitad, de
//   ancho (espesor + holgura), para que se traben.
//
// Todo en mm. Coordenadas interiores: x en (0,iw), y en (0,id).

import type { BoxConfig, Contour, Piece } from "./types";
import { ConfigError } from "./validation";

export interface DividerPositions {
  xs: number[]; // posiciones interiores de divisores X (parten el ancho)
  ys: number[]; // posiciones interiores de divisores Y (parten la profundidad)
}

/** Calcula y valida posiciones (uniformes o personalizadas). */
export function computeDividerPositions(cfg: BoxConfig, iw: number, id: number): DividerPositions {
  const d = cfg.dividers;
  const uniform = (count: number, span: number): number[] => {
    const out: number[] = [];
    for (let i = 1; i <= count; i++) out.push((span * i) / (count + 1));
    return out;
  };
  const fromCustom = (fracs: number[], span: number): number[] =>
    fracs.map((f) => f * span);

  const xs = d.customX && d.customX.length ? fromCustom(d.customX, iw) : uniform(d.countX, iw);
  const ys = d.customY && d.customY.length ? fromCustom(d.customY, id) : uniform(d.countY, id);

  validatePositions(xs, iw, cfg.thickness, "ancho (X)");
  validatePositions(ys, id, cfg.thickness, "profundidad (Y)");
  return { xs, ys };
}

function validatePositions(pos: number[], span: number, t: number, axis: string): void {
  const minGap = 2 * t; // separación mínima entre divisores y respecto de las paredes
  const sorted = [...pos].sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (!(p > 0 && p < span)) {
      throw new ConfigError(`Un divisor en ${axis} queda fuera del interior (0..${span.toFixed(1)} mm).`);
    }
    if (p - prev < minGap) {
      throw new ConfigError(
        `Divisores en ${axis} demasiado juntos (separación mínima ${minGap.toFixed(1)} mm).`,
      );
    }
    prev = p;
  }
  if (sorted.length && span - sorted[sorted.length - 1] < minGap) {
    throw new ConfigError(`El último divisor en ${axis} queda demasiado cerca de la pared.`);
  }
}

/** Rectángulo en orden horario (para huecos, winding opuesto al contorno CCW). */
function holeRect(x0: number, y0: number, x1: number, y1: number): Contour {
  return [
    { x: x0, y: y0 },
    { x: x0, y: y1 },
    { x: x1, y: y1 },
    { x: x1, y: y0 },
  ];
}

export interface DividerBuild {
  pieces: Piece[];
  /** Mortajas (huecos) para paredes frente/trasera, en coords locales de pared (u=X). */
  mortisesFB: Contour[];
  /** Mortajas para paredes izq/der, en coords locales de pared (u=Y). */
  mortisesLR: Contour[];
}

/**
 * Construye las piezas de divisores y las mortajas que deben abrirse en las
 * paredes. `baseZ` es la cota donde apoyan (tope del fondo = t).
 */
export function buildDividers(
  cfg: BoxConfig,
  iw: number,
  id: number,
  ih: number,
  pos: DividerPositions,
): DividerBuild {
  const t = cfg.thickness;
  const fit = cfg.fit;
  const hw = (t + fit) / 2; // medio ancho de ranura/mortaja
  const vMargin = Math.min(2 * t, ih * 0.25); // margen de la espiga respecto de arriba/abajo
  const pieces: Piece[] = [];
  const mortisesFB: Contour[] = [];
  const mortisesLR: Contour[] = [];

  // --- Divisores X (panel YZ: u=profundidad, v=altura) ---
  for (let k = 0; k < pos.xs.length; k++) {
    const x = pos.xs[k];
    const outline = buildDividerOutline(id, ih, t, vMargin, hw, pos.ys, "top");
    pieces.push({
      id: `divX-${k}`,
      label: `Divisor X ${k + 1}`,
      outline,
      holes: [],
      thickness: t,
      assembly: {
        position: [t + x - t / 2, t, t],
        xAxis: [0, 1, 0], // u -> Y
        yAxis: [0, 0, 1], // v -> Z
        zAxis: [1, 0, 0], // extrusión -> X
        explodeDir: [0, 0, 1],
      },
    });
    // Mortajas en frente/trasera, a la altura de la espiga, centradas en u = t + x.
    mortisesFB.push(holeRect(t + x - hw, vMargin, t + x + hw, ih - vMargin));
  }

  // --- Divisores Y (panel XZ: u=ancho, v=altura) ---
  for (let k = 0; k < pos.ys.length; k++) {
    const y = pos.ys[k];
    const outline = buildDividerOutline(iw, ih, t, vMargin, hw, pos.xs, "bottom");
    pieces.push({
      id: `divY-${k}`,
      label: `Divisor Y ${k + 1}`,
      outline,
      holes: [],
      thickness: t,
      assembly: {
        position: [t, t + y - t / 2, t],
        xAxis: [1, 0, 0], // u -> X
        yAxis: [0, 0, 1], // v -> Z
        zAxis: [0, 1, 0], // extrusión -> Y
        explodeDir: [0, 0, 1],
      },
    });
    mortisesLR.push(holeRect(t + y - hw, vMargin, t + y + hw, ih - vMargin));
  }

  return { pieces, mortisesFB, mortisesLR };
}

/**
 * Contorno de un divisor de longitud `span` (u) y altura `ih` (v):
 * - Espigas en ambos extremos (u=0 y u=span) hacia afuera (+/- t).
 * - Ranuras de media madera en los cruces (`crossAt`), desde `slotFrom`
 *   ("top" = desde arriba, "bottom" = desde abajo) hasta la mitad.
 */
function buildDividerOutline(
  span: number,
  ih: number,
  t: number,
  vMargin: number,
  hw: number,
  crossAt: number[],
  slotFrom: "top" | "bottom",
): Contour {
  const pts: Contour = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-9 || Math.abs(last.y - y) > 1e-9) pts.push({ x, y });
  };
  const crosses = [...crossAt].sort((a, b) => a - b);
  const mid = ih / 2;

  // Borde inferior (v=0), de u=0 a u=span. Ranuras desde abajo si corresponde.
  push(0, 0);
  if (slotFrom === "bottom") {
    for (const c of crosses) {
      push(c - hw, 0);
      push(c - hw, mid);
      push(c + hw, mid);
      push(c + hw, 0);
    }
  }
  push(span, 0);

  // Borde derecho (u=span): espiga hacia +u.
  push(span, vMargin);
  push(span + t, vMargin);
  push(span + t, ih - vMargin);
  push(span, ih - vMargin);
  push(span, ih);

  // Borde superior (v=ih), de u=span a u=0. Ranuras desde arriba si corresponde.
  if (slotFrom === "top") {
    for (let i = crosses.length - 1; i >= 0; i--) {
      const c = crosses[i];
      push(c + hw, ih);
      push(c + hw, mid);
      push(c - hw, mid);
      push(c - hw, ih);
    }
  }
  push(0, ih);

  // Borde izquierdo (u=0): espiga hacia -u.
  push(0, ih - vMargin);
  push(-t, ih - vMargin);
  push(-t, vMargin);
  push(0, vMargin);
  // cierra en (0,0) implícito

  return pts;
}
