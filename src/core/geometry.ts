// Motor geométrico PURO para la caja abierta.
//
// Construcción (definida por la habilidad): fondo DEBAJO de las paredes.
//   - Fondo: placa (ancho_ext x prof_ext) en Z 0..t.
//   - 4 paredes de altura = altura_interior, apoyadas sobre el fondo (Z t..t+h).
//   - Esquinas verticales: encastre de dientes complementario entre paredes
//     adyacentes (misma altura => mismo nº de dientes => complementarias).
//   - Unión pared-fondo: lengüetas en el borde inferior de cada pared que
//     encajan en muescas del perímetro del fondo (separadas t de las esquinas
//     para no colisionar con el encastre vertical).
//
// Fórmulas (SOLO para esta construcción):
//   ancho_ext  = ancho_int  + 2t
//   prof_ext   = prof_int   + 2t
//   altura_ext = altura_int + t
//
// Ejes: X = ancho, Y = profundidad, Z = altura.

import type { BoxConfig, BoxModel, Contour, Piece, Point } from "./types";
import { fingerEdge, resolveToothCount } from "./teeth";
import { validateConfig } from "./validation";
import { buildDividers, computeDividerPositions } from "./dividers";
import { buildHingedLid } from "./hinge";

/** Intervalos [inicio,fin] (en mm) de las lengüetas inferiores de una pared. */
interface TabIntervals {
  count: number;
  intervals: Array<[number, number]>;
  effective: number;
}

/** Quita el último punto si coincide con el primero (contorno sin cerrar explícito). */
function dropClosing(pts: Point[]): Point[] {
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) pts.pop();
  }
  return pts;
}

/**
 * Calcula los intervalos de lengüetas para el borde inferior de una pared de
 * ancho `width`. Las lengüetas viven en la zona [t, width-t] (separadas de las
 * esquinas). Son los segmentos "diente" de un patrón impar que empieza en diente.
 */
function bottomTabIntervals(width: number, t: number, toothTarget: number, fit: number): TabIntervals {
  const usable = width - 2 * t;
  const { count, effective } = resolveToothCount(usable, toothTarget);
  const w = usable / count;
  const intervals: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const isTab = i % 2 === 0; // empieza y termina en diente (count impar)
    if (!isTab) continue;
    // Lengüeta angostada por holgura (salvo si toca el borde de la zona usable).
    const a = t + i * w + (i === 0 ? 0 : fit / 2);
    const b = t + (i + 1) * w - (i === count - 1 ? 0 : fit / 2);
    intervals.push([a, b]);
  }
  return { count, intervals, effective };
}

/**
 * Construye el contorno de una pared en coordenadas locales (u a lo largo del
 * ancho, v a lo largo de la altura). Recorrido CCW empezando en (0,0).
 *   - Bordes izq/der (u=0, u=width): encastre vertical, muescas hacia adentro.
 *   - Borde inferior (v=0): lengüetas hacia abajo (v=-t).
 *   - Borde superior (v=height): plano (caja abierta).
 */
function buildWallOutline(
  width: number,
  height: number,
  t: number,
  toothTarget: number,
  fit: number,
  vStartTab: boolean,
  topTabs: boolean,
): { outline: Contour; tabs: TabIntervals } {
  const pts: Point[] = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-9 || Math.abs(last.y - y) > 1e-9) {
      pts.push({ x, y });
    }
  };

  const tabs = bottomTabIntervals(width, t, toothTarget, fit);

  // --- Borde inferior (v=0), de u=0 a u=width, lengüetas hacia abajo ---
  push(0, 0);
  for (const [a, b] of tabs.intervals) {
    push(a, 0);
    push(a, -t);
    push(b, -t);
    push(b, 0);
  }
  push(width, 0);

  // --- Borde derecho (u=width), de v=0 a v=height, encastre vertical ---
  // Muesca hacia adentro => u decrece a width - t.
  const { count: vCount } = resolveToothCount(height, toothTarget);
  const fe = fingerEdge({ length: height, count: vCount, depth: t, startTab: vStartTab, fit });
  for (const p of fe) {
    // p.x recorre la altura (v); p.y = t (diente, en el borde) o 0 (muesca, adentro).
    push(width - (t - p.y), p.x);
  }
  push(width, height);

  // --- Borde superior (v=height), de u=width a u=0 ---
  // Plano (caja abierta) o con lengüetas hacia arriba (hacia la tapa).
  if (topTabs) {
    for (let i = tabs.intervals.length - 1; i >= 0; i--) {
      const [a, b] = tabs.intervals[i];
      push(b, height);
      push(b, height + t);
      push(a, height + t);
      push(a, height);
    }
  }
  push(0, height);

  // --- Borde izquierdo (u=0), de v=height a v=0, encastre vertical ---
  // Recorremos de arriba hacia abajo; muesca hacia adentro => u crece a t.
  for (let i = fe.length - 1; i >= 0; i--) {
    const p = fe[i];
    push(t - p.y, p.x);
  }
  push(0, 0);

  return { outline: dropClosing(pts), tabs };
}

/**
 * Construye el contorno del fondo (ancho W x profundidad D) con muescas en el
 * perímetro para las lengüetas de las cuatro paredes. Recorrido CCW.
 */
function buildBottomOutline(
  W: number,
  D: number,
  t: number,
  frontBackTabs: TabIntervals,
  leftRightTabs: TabIntervals,
  fit: number,
): Contour {
  const pts: Point[] = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.abs(last.x - x) > 1e-9 || Math.abs(last.y - y) > 1e-9) {
      pts.push({ x, y });
    }
  };
  const grow = fit / 2; // muescas un poco más grandes para que entre la lengüeta

  // Borde inferior (Y=0), de X=0 a X=W. Muescas del frente (hacia +Y).
  push(0, 0);
  for (const [a, b] of frontBackTabs.intervals) {
    push(a - grow, 0);
    push(a - grow, t);
    push(b + grow, t);
    push(b + grow, 0);
  }
  push(W, 0);

  // Borde derecho (X=W), de Y=0 a Y=D. Muescas de la pared derecha (hacia -X).
  for (const [a, b] of leftRightTabs.intervals) {
    push(W, a - grow);
    push(W - t, a - grow);
    push(W - t, b + grow);
    push(W, b + grow);
  }
  push(W, D);

  // Borde superior (Y=D), de X=W a X=0. Muescas del fondo-trasero (hacia -Y).
  for (let i = frontBackTabs.intervals.length - 1; i >= 0; i--) {
    const [a, b] = frontBackTabs.intervals[i];
    push(b + grow, D);
    push(b + grow, D - t);
    push(a - grow, D - t);
    push(a - grow, D);
  }
  push(0, D);

  // Borde izquierdo (X=0), de Y=D a Y=0. Muescas de la pared izquierda (hacia +X).
  for (let i = leftRightTabs.intervals.length - 1; i >= 0; i--) {
    const [a, b] = leftRightTabs.intervals[i];
    push(0, b + grow);
    push(t, b + grow);
    push(t, a - grow);
    push(0, a - grow);
  }
  push(0, 0);

  return dropClosing(pts);
}

/** Construye el modelo completo de la caja abierta a partir de la configuración. */
export function buildOpenBox(cfg: BoxConfig): BoxModel {
  validateConfig(cfg);
  const t = cfg.thickness;
  // Convertir a dimensiones INTERIORES reales según el modo de medida.
  const iw = cfg.measure === "outer" ? cfg.inner.width - 2 * t : cfg.inner.width;
  const id = cfg.measure === "outer" ? cfg.inner.depth - 2 * t : cfg.inner.depth;
  const ih = cfg.measure === "outer" ? cfg.inner.height - t : cfg.inner.height;
  if (iw <= 0 || id <= 0 || ih <= 0) {
    throw new Error("Las medidas exteriores son demasiado chicas para el espesor dado.");
  }
  const W = iw + 2 * t; // ancho exterior
  const D = id + 2 * t; // profundidad exterior
  const wallH = ih; // paredes apoyadas sobre el fondo
  const flatTop = cfg.lid === "flat"; // tapa plana cautiva (paredes con lengüeta superior)
  const hinged = cfg.lid === "hinged"; // tapa plana con bisagra en la trasera
  const overlay = cfg.lid === "overlay"; // tapa sobrepuesta (falda externa)
  const boxOuterH = ih + t; // altura exterior de la caja abierta (sin tapa)
  // Altura del envolvente total según la tapa.
  const outerHeight = cfg.lid === "none" ? boxOuterH : boxOuterH + t;

  const warnings: string[] = [];

  // Paredes frente/fondo: ancho W. Paredes izq/der: ancho D.
  // Esquinas complementarias: frente/fondo con startTab=true, izq/der con false.
  // Con tapa, las paredes llevan lengüetas superiores hacia la tapa.
  const fb = buildWallOutline(W, wallH, t, cfg.toothTarget, cfg.fit, true, flatTop);
  const lr = buildWallOutline(D, wallH, t, cfg.toothTarget, cfg.fit, false, flatTop);

  // Aviso si el diente efectivo difiere del objetivo.
  const vTooth = resolveToothCount(wallH, cfg.toothTarget).effective;
  if (Math.abs(vTooth - cfg.toothTarget) > 0.5) {
    warnings.push(
      `Diente vertical efectivo ${vTooth.toFixed(1)} mm (objetivo ${cfg.toothTarget} mm).`,
    );
  }

  const bottomOutline = buildBottomOutline(W, D, t, fb.tabs, lr.tabs, cfg.fit);

  // Divisores (si hay). Generan piezas y mortajas en las paredes.
  const hasDividers =
    cfg.dividers.countX > 0 ||
    cfg.dividers.countY > 0 ||
    (cfg.dividers.customX?.length ?? 0) > 0 ||
    (cfg.dividers.customY?.length ?? 0) > 0;
  const div = hasDividers
    ? buildDividers(cfg, iw, id, ih, computeDividerPositions(cfg, iw, id))
    : { pieces: [], mortisesFB: [], mortisesLR: [] };

  // Transformadas de ensamblaje. El espesor se extruye a lo largo de zAxis.
  // Mundo: X=ancho (0..W), Y=profundidad (0..D), Z=altura (0..W_h).
  const pieces: Piece[] = [
    {
      id: "bottom",
      label: "Fondo",
      outline: bottomOutline,
      holes: [],
      thickness: t,
      assembly: {
        position: [0, 0, 0],
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        zAxis: [0, 0, 1],
        explodeDir: [0, 0, -1],
      },
    },
    {
      id: "front",
      label: "Frente",
      outline: fb.outline,
      holes: div.mortisesFB,
      thickness: t,
      // u->X, v->Z (apoyada sobre el fondo, +t), extrusión -> +Y
      assembly: {
        position: [0, 0, t],
        xAxis: [1, 0, 0],
        yAxis: [0, 0, 1],
        zAxis: [0, 1, 0],
        explodeDir: [0, -1, 0],
      },
    },
    {
      id: "back",
      label: "Fondo trasero",
      outline: fb.outline,
      holes: div.mortisesFB,
      thickness: t,
      assembly: {
        position: [0, D - t, t],
        xAxis: [1, 0, 0],
        yAxis: [0, 0, 1],
        zAxis: [0, 1, 0],
        explodeDir: [0, 1, 0],
      },
    },
    {
      id: "left",
      label: "Lateral izquierdo",
      outline: lr.outline,
      holes: div.mortisesLR,
      thickness: t,
      // u->Y, v->Z, extrusión -> +X
      assembly: {
        position: [0, 0, t],
        xAxis: [0, 1, 0],
        yAxis: [0, 0, 1],
        zAxis: [1, 0, 0],
        explodeDir: [-1, 0, 0],
      },
    },
    {
      id: "right",
      label: "Lateral derecho",
      outline: lr.outline,
      holes: div.mortisesLR,
      thickness: t,
      assembly: {
        position: [W - t, 0, t],
        xAxis: [0, 1, 0],
        yAxis: [0, 0, 1],
        zAxis: [1, 0, 0],
        explodeDir: [1, 0, 0],
      },
    },
  ];

  // --- Tapa según tipo ---
  if (flatTop) {
    // Tapa plana cautiva: mismo contorno que el fondo, arriba.
    pieces.push({
      id: "lid",
      label: "Tapa",
      outline: bottomOutline,
      holes: [],
      thickness: t,
      assembly: {
        position: [0, 0, ih + t],
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        zAxis: [0, 0, 1],
        explodeDir: [0, 0, 1],
      },
    });
  } else if (overlay) {
    pieces.push(...buildOverlayLid(cfg, W, D, boxOuterH));
  } else if (hinged) {
    const h = buildHingedLid(cfg, W, D, wallH, t, fb.outline);
    // Reemplazar la trasera por la versión con nudillos de bisagra.
    const backIdx = pieces.findIndex((p) => p.id === "back");
    pieces[backIdx] = h.back;
    pieces.push(h.lid);
    warnings.push(...h.warnings);
  }

  // Divisores.
  pieces.push(...div.pieces);

  return {
    pieces,
    outer: { width: W, depth: D, height: outerHeight },
    warnings,
  };
}

/**
 * Tapa sobrepuesta: una caja abierta poco profunda que encaja por fuera del
 * borde superior. Se construye con el MISMO motor y se voltea sobre la caja.
 */
function buildOverlayLid(cfg: BoxConfig, W: number, D: number, boxOuterH: number): Piece[] {
  const t = cfg.thickness;
  const g = cfg.overlay.gap;
  const overlapH = cfg.overlay.overlap;
  // Sub-caja abierta: interior = exterior de la caja + holgura por lado.
  // El diente de la falda debe caber al menos 3 veces en su altura (overlap).
  const skirtTooth = Math.min(cfg.toothTarget, overlapH / 3.2);
  const sub: BoxConfig = {
    ...cfg,
    lid: "none",
    measure: "inner",
    toothTarget: skirtTooth,
    inner: { width: W + 2 * g, depth: D + 2 * g, height: overlapH },
    dividers: { countX: 0, countY: 0 },
  };
  const lidModel = buildOpenBox(sub);
  // Voltear en Z y trasladar para que la tapa quede sobre la caja.
  // local (x,y,z) -> mundo (x - t - g, y - t - g, (boxOuterH + t) - z)
  const flipVec = (v: [number, number, number]): [number, number, number] => [v[0], v[1], -v[2]];
  return lidModel.pieces.map((p) => ({
    ...p,
    id: `lid-${p.id}`,
    label: `Tapa: ${p.label.toLowerCase()}`,
    assembly: {
      position: [
        p.assembly.position[0] - t - g,
        p.assembly.position[1] - t - g,
        boxOuterH + t - p.assembly.position[2],
      ],
      xAxis: flipVec(p.assembly.xAxis),
      yAxis: flipVec(p.assembly.yAxis),
      zAxis: flipVec(p.assembly.zAxis),
      explodeDir: [p.assembly.explodeDir[0], p.assembly.explodeDir[1], -p.assembly.explodeDir[2]],
    },
  }));
}
