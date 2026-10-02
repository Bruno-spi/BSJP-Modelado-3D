// Generación de dientes (encastre tipo caja y espiga).
//
// Convención de ejes de un BORDE: se recorre a lo largo de +X, desde (0,0)
// hasta (length,0). Un "diente" (tab) sobresale hacia +Y una profundidad
// `depth`; una "muesca" (notch) se queda en Y=0. Dos bordes que encastran
// comparten `length` y `count`, y se generan con `startTab` opuesto, por lo
// que son geométricamente complementarios.
//
// La HOLGURA de encastre (`fit`) se aplica SOLO a las transiciones internas:
// los dientes internos se angostan `fit` y las muescas se ensanchan `fit`.
// Los extremos del borde NO se tocan, para no alterar la medida exterior.
// El KERF NO se aplica aquí: se compensa después, a nivel de contorno.

import type { Point } from "./types";

export interface EdgeFingerSpec {
  length: number;
  /** Nº de segmentos (dientes + muescas). Debe ser impar y >= 3. */
  count: number;
  /** Profundidad del diente hacia +Y (normalmente = espesor). */
  depth: number;
  /** Si el primer segmento es diente (true) o muesca (false). */
  startTab: boolean;
  /** Holgura de encastre en mm. */
  fit: number;
}

export interface ToothCount {
  count: number;
  /** Ancho efectivo de cada segmento en mm. */
  effective: number;
}

const MIN_TOOTH = 2; // mm, diente mínimo razonable para corte láser

/**
 * Calcula un nº impar de segmentos para un borde de longitud `length`
 * acercándose al tamaño objetivo. Garantiza count >= 3 e impar.
 */
export function resolveToothCount(length: number, target: number): ToothCount {
  if (!(length > 0) || !(target > 0)) {
    throw new Error("resolveToothCount: longitud y objetivo deben ser > 0");
  }
  let count = Math.round(length / target);
  if (count < 3) count = 3;
  if (count % 2 === 0) count += 1; // forzar impar -> simétrico (diente en ambos extremos si startTab)
  // No permitir dientes por debajo del mínimo.
  while (count > 3 && length / count < MIN_TOOTH) {
    count -= 2;
  }
  return { count, effective: length / count };
}

/**
 * Genera el perfil de un borde con dientes como polilínea relativa.
 * El primer punto es (0,0) y el último (length,0). No cierra el contorno.
 */
export function fingerEdge(spec: EdgeFingerSpec): Point[] {
  const { length, count, depth, startTab, fit } = spec;
  if (count < 3 || count % 2 === 0) {
    throw new Error(`fingerEdge: count debe ser impar y >=3 (recibido ${count})`);
  }
  const w = length / count;
  const half = fit / 2;
  const pts: Point[] = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || last.x !== x || last.y !== y) pts.push({ x, y });
  };

  push(0, startTab ? depth : 0);
  for (let i = 0; i < count; i++) {
    const isTab = startTab ? i % 2 === 0 : i % 2 === 1;
    const segStart = i * w;
    const segEnd = (i + 1) * w;
    const isFirst = i === 0;
    const isLast = i === count - 1;
    // Aplicar holgura solo a transiciones internas.
    const leftAdj = isFirst ? 0 : isTab ? half : -half;
    const rightAdj = isLast ? 0 : isTab ? -half : half;
    const y = isTab ? depth : 0;
    const x0 = segStart + leftAdj;
    const x1 = segEnd + rightAdj;
    // Entrar al segmento a su nivel.
    push(x0, y);
    push(x1, y);
  }
  // Asegurar terminación exacta en (length, nivel del último).
  const lastTab = startTab ? (count - 1) % 2 === 0 : (count - 1) % 2 === 1;
  push(length, lastTab ? depth : 0);
  return pts;
}
