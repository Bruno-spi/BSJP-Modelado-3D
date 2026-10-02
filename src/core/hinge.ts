// Bisagra de pin: une la tapa plana a la pared trasera mediante nudillos
// (knuckles) intercalados con un pin (varilla) común.
//
// IMPORTANTE: se verifican invariantes 2D (nudillos complementarios, huecos de
// pin colineales y equiespaciados, diámetro de hueco = pin + holgura, contornos
// cerrados). La ROTACIÓN y el AJUSTE FÍSICO NO están verificados: requieren un
// corte de prueba. No asumir fabricable porque se vea bien.
//
// Geometría: a lo largo del borde superior trasero (eje X) se reparten nudillos
// de ancho `kw`. Cada nudillo es un rectángulo rematado por un SEMICÍRCULO de
// radio R = kw/2 centrado en el eje del pin, con un hueco de pin en el centro.
// La pared trasera toma los nudillos pares; la tapa, los impares (complementario).

import type { BoxConfig, Contour, Piece, Point } from "./types";
import { ConfigError } from "./validation";

const ARC_SEGMENTS = 12;
const CIRCLE_SEGMENTS = 24;

/** Círculo como contorno horario (hueco), centro (cx,cy), radio r. */
function circleHole(cx: number, cy: number, r: number): Contour {
  const pts: Contour = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const a = -(i / CIRCLE_SEGMENTS) * Math.PI * 2; // horario
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

export interface HingePlan {
  count: number;
  segW: number;
  kw: number; // ancho efectivo del nudillo (con holgura lateral)
  R: number; // radio del semicírculo = kw/2
  holeR: number; // radio del hueco del pin
  spanStart: number;
  /** Centros u de cada nudillo. */
  centers: number[];
  /** owner[i] = "back" | "lid". */
  owners: Array<"back" | "lid">;
}

export function planHinge(cfg: BoxConfig, W: number): HingePlan {
  const t = cfg.thickness;
  const count = cfg.hinge.knuckles;
  if (!Number.isInteger(count) || count < 3) {
    throw new ConfigError("La bisagra necesita al menos 3 nudillos.");
  }
  const inset = t;
  const spanStart = inset;
  const spanEnd = W - inset;
  const segW = (spanEnd - spanStart) / count;
  const kw = segW - cfg.hinge.clearance;
  const holeR = (cfg.hinge.pinDiameter + cfg.hinge.clearance) / 2;
  if (kw <= 0) throw new ConfigError("Demasiados nudillos para el ancho disponible.");
  if (holeR * 2 >= kw) {
    throw new ConfigError(
      `El pin (${cfg.hinge.pinDiameter} mm) no entra en el nudillo (ancho ${kw.toFixed(1)} mm). Reducí el pin o los nudillos.`,
    );
  }
  const R = kw / 2;
  const centers: number[] = [];
  const owners: Array<"back" | "lid"> = [];
  for (let i = 0; i < count; i++) {
    centers.push(spanStart + (i + 0.5) * segW);
    owners.push(i % 2 === 0 ? "back" : "lid");
  }
  return { count, segW, kw, R, holeR, spanStart, centers, owners };
}

/** Perfil de nudillos sobre una línea base `baseV`, recorriendo u de uHi a uLo. */
function knuckleProfile(
  plan: HingePlan,
  baseV: number,
  owner: "back" | "lid",
  uHi: number,
  uLo: number,
): Point[] {
  const pts: Point[] = [];
  const R = plan.R;
  const axisV = baseV + R;
  // Nudillos de este dueño, ordenados de mayor a menor u (recorrido descendente).
  const mine = plan.centers
    .map((c, i) => ({ c, owner: plan.owners[i] }))
    .filter((k) => k.owner === owner)
    .sort((a, b) => b.c - a.c);
  for (const k of mine) {
    const uc = k.c;
    if (uc > uHi || uc < uLo) continue;
    pts.push({ x: uc + R, y: baseV });
    pts.push({ x: uc + R, y: axisV });
    // Semicírculo superior de ángulo 0 (derecha) a PI (izquierda).
    for (let s = 1; s < ARC_SEGMENTS; s++) {
      const a = (s / ARC_SEGMENTS) * Math.PI;
      pts.push({ x: uc + R * Math.cos(a), y: axisV + R * Math.sin(a) });
    }
    pts.push({ x: uc - R, y: axisV });
    pts.push({ x: uc - R, y: baseV });
  }
  return pts;
}

/** Huecos de pin de un dueño, en la línea `axisV`. */
function pinHoles(plan: HingePlan, baseV: number, owner: "back" | "lid"): Contour[] {
  const axisV = baseV + plan.R;
  return plan.centers
    .filter((_, i) => plan.owners[i] === owner)
    .map((uc) => circleHole(uc, axisV, plan.holeR));
}

export interface HingeResult {
  back: Piece;
  lid: Piece;
  warnings: string[];
}

/**
 * Construye la pared trasera con nudillos (a partir del contorno plano `backOutline`)
 * y la tapa con nudillos complementarios. `wallH` es la altura de pared.
 */
export function buildHingedLid(
  cfg: BoxConfig,
  W: number,
  D: number,
  wallH: number,
  t: number,
  backOutline: Contour,
): HingeResult {
  const plan = planHinge(cfg, W);
  const boxOuterH = wallH + t;
  const axisZ = boxOuterH + plan.R;

  // --- Pared trasera: insertar nudillos en el borde superior (de (W,wallH) a (0,wallH)) ---
  const backKnuckles = knuckleProfile(plan, wallH, "back", W, 0);
  const spliced: Contour = [];
  for (let i = 0; i < backOutline.length; i++) {
    const a = backOutline[i];
    spliced.push(a);
    const b = backOutline[(i + 1) % backOutline.length];
    const isTopEdge =
      Math.abs(a.x - W) < 1e-6 && Math.abs(a.y - wallH) < 1e-6 &&
      Math.abs(b.x - 0) < 1e-6 && Math.abs(b.y - wallH) < 1e-6;
    if (isTopEdge) spliced.push(...backKnuckles);
  }
  const back: Piece = {
    id: "back",
    label: "Trasera (bisagra)",
    outline: spliced,
    holes: pinHoles(plan, wallH, "back"),
    thickness: t,
    assembly: {
      position: [0, D - t, t],
      xAxis: [1, 0, 0],
      yAxis: [0, 0, 1],
      zAxis: [0, 1, 0],
      explodeDir: [0, 1, 0],
    },
  };

  // --- Tapa plana W x D con nudillos complementarios en el borde trasero (v=D) ---
  const lidOutline: Contour = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
  ];
  // Borde trasero (v=D) de u=W a u=0 con nudillos de la tapa.
  lidOutline.push(...knuckleProfile(plan, D, "lid", W, 0));
  lidOutline.push({ x: 0, y: D });
  // (cierra en (0,0))

  const lid: Piece = {
    id: "lid",
    label: "Tapa (bisagra)",
    outline: lidOutline,
    holes: pinHoles(plan, D, "lid"),
    thickness: t,
    // Posición ABIERTA: coplanar con la trasera, hacia arriba, pin compartido.
    assembly: {
      position: [0, D - t, axisZ + D + plan.R],
      xAxis: [1, 0, 0],
      yAxis: [0, 0, -1],
      zAxis: [0, 1, 0],
      explodeDir: [0, 0, 1],
    },
  };

  return {
    back,
    lid,
    warnings: [
      "Bisagra de pin: geometría 2D verificada, pero el ajuste y la rotación NO están comprobados. Hacé un corte de prueba. La tapa se muestra en posición abierta.",
      `Pin: diámetro ${cfg.hinge.pinDiameter} mm; comprá una varilla de ese diámetro (no se corta en láser).`,
    ],
  };
}
