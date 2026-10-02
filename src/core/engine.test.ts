import { describe, it, expect } from "vitest";
import { buildOpenBox } from "./geometry";
import { DEFAULT_CONFIG, cloneConfig, serializeConfig, deserializeConfig } from "./config";
import { toMm, fromMm, MM_PER_INCH } from "./units";
import { fingerEdge, resolveToothCount } from "./teeth";
import { validateConfig, ConfigError } from "./validation";
import { offsetContour, signedArea, applyKerf } from "./offset";
import type { Contour } from "./types";

// --- Helpers ---------------------------------------------------------------

/** Nivel (y) de un perfil escalonado en una x dada. */
function yAt(profile: { x: number; y: number }[], x: number): number {
  let y = profile[0].y;
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi && a.y === b.y) y = a.y;
  }
  return y;
}

function bbox(c: Contour) {
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function hasDuplicateConsecutive(c: Contour): boolean {
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) return true;
  }
  return false;
}

// --- Dimensiones -----------------------------------------------------------

describe("dimensiones exteriores", () => {
  it("caso base 150x100x50, t=3 => exterior 156x106x53", () => {
    const model = buildOpenBox(DEFAULT_CONFIG);
    expect(model.outer.width).toBeCloseTo(156, 6);
    expect(model.outer.depth).toBeCloseTo(106, 6);
    expect(model.outer.height).toBeCloseTo(53, 6);
  });

  it("el fondo tiene el footprint exterior 156x106", () => {
    const model = buildOpenBox(DEFAULT_CONFIG);
    const bottom = model.pieces.find((p) => p.id === "bottom")!;
    const bb = bbox(bottom.outline);
    expect(bb.w).toBeCloseTo(156, 6);
    expect(bb.h).toBeCloseTo(106, 6);
  });

  it("modo exterior: 156x106x53 externas dan la misma caja que 150x100x50 internas", () => {
    const inner = buildOpenBox(DEFAULT_CONFIG);
    const outerCfg = cloneConfig(DEFAULT_CONFIG);
    outerCfg.measure = "outer";
    outerCfg.inner = { width: 156, depth: 106, height: 53 };
    const outer = buildOpenBox(outerCfg);
    expect(outer.outer).toEqual(inner.outer);
    for (let i = 0; i < inner.pieces.length; i++) {
      expect(outer.pieces[i].outline).toEqual(inner.pieces[i].outline);
    }
  });
});

describe("tapa plana", () => {
  it("con tapa, altura exterior = interior + 2t y aparece la pieza tapa", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.lid = "flat";
    const model = buildOpenBox(cfg);
    expect(model.outer.height).toBeCloseTo(50 + 2 * 3, 6);
    expect(model.pieces.some((p) => p.id === "lid")).toBe(true);
    // La pared ahora tiene lengüeta inferior y superior: alto = ih + 2t.
    const front = model.pieces.find((p) => p.id === "front")!;
    const bb = bbox(front.outline);
    expect(bb.h).toBeCloseTo(50 + 2 * 3, 6);
    // La tapa tiene el mismo contorno que el fondo.
    const lid = model.pieces.find((p) => p.id === "lid")!;
    const bottom = model.pieces.find((p) => p.id === "bottom")!;
    expect(lid.outline).toEqual(bottom.outline);
  });
});

describe("divisores", () => {
  it("posiciones uniformes: countX=2 -> interior/3 y 2/3", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dividers = { countX: 2, countY: 0 };
    const model = buildOpenBox(cfg);
    const divs = model.pieces.filter((p) => p.id.startsWith("divX"));
    expect(divs.length).toBe(2);
    // Mortajas en frente y trasera: una por divisor X.
    const front = model.pieces.find((p) => p.id === "front")!;
    const back = model.pieces.find((p) => p.id === "back")!;
    expect(front.holes.length).toBe(2);
    expect(back.holes.length).toBe(2);
  });

  it("grilla 2x1: piezas, mortajas y media madera (ranuras a media altura)", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dividers = { countX: 2, countY: 1 };
    const model = buildOpenBox(cfg);
    expect(model.pieces.filter((p) => p.id.startsWith("divX")).length).toBe(2);
    expect(model.pieces.filter((p) => p.id.startsWith("divY")).length).toBe(1);
    const left = model.pieces.find((p) => p.id === "left")!;
    expect(left.holes.length).toBe(1); // 1 divisor Y -> 1 mortaja por lateral
    // El divisor X tiene ranuras de media madera: puntos a v = ih/2 = 25.
    const divX = model.pieces.find((p) => p.id === "divX-0")!;
    expect(divX.outline.some((p) => Math.abs(p.y - 25) < 1e-6)).toBe(true);
  });

  it("posiciones personalizadas por fracción", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dividers = { countX: 0, countY: 0, customX: [0.25, 0.5] };
    const model = buildOpenBox(cfg);
    expect(model.pieces.filter((p) => p.id.startsWith("divX")).length).toBe(2);
    // Mortajas centradas en u = t + frac*iw = 3 + {37.5, 75}.
    const front = model.pieces.find((p) => p.id === "front")!;
    const centers = front.holes
      .map((h) => (Math.min(...h.map((p) => p.x)) + Math.max(...h.map((p) => p.x))) / 2)
      .sort((a, b) => a - b);
    expect(centers[0]).toBeCloseTo(3 + 0.25 * 150, 3);
    expect(centers[1]).toBeCloseTo(3 + 0.5 * 150, 3);
  });

  it("rechaza divisores demasiado juntos", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.dividers = { countX: 0, countY: 0, customX: [0.5, 0.51] };
    expect(() => buildOpenBox(cfg)).toThrow();
  });
});

describe("tapa sobrepuesta", () => {
  it("genera 5 piezas de tapa (lid-*) y altura exterior interior+2t", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.lid = "overlay";
    const model = buildOpenBox(cfg);
    expect(model.pieces.filter((p) => p.id.startsWith("lid-")).length).toBe(5);
    expect(model.outer.height).toBeCloseTo(50 + 2 * 3, 6);
  });
});

describe("bisagra de pin", () => {
  it("trasera y tapa con huecos de pin complementarios", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.lid = "hinged";
    cfg.hinge = { pinDiameter: 3, knuckles: 5, clearance: 0.4 };
    const model = buildOpenBox(cfg);
    const back = model.pieces.find((p) => p.id === "back")!;
    const lid = model.pieces.find((p) => p.id === "lid")!;
    // 5 nudillos: 3 a la trasera (pares 0,2,4), 2 a la tapa (impares 1,3).
    expect(back.holes.length).toBe(3);
    expect(lid.holes.length).toBe(2);
    expect(model.warnings.some((w) => w.toLowerCase().includes("no están comprobados"))).toBe(true);
  });

  it("rechaza un pin que no entra en el nudillo", () => {
    const cfg = cloneConfig(DEFAULT_CONFIG);
    cfg.lid = "hinged";
    cfg.hinge = { pinDiameter: 50, knuckles: 5, clearance: 0.4 };
    expect(() => buildOpenBox(cfg)).toThrow();
  });
});

describe("ensamblaje 3D", () => {
  function dot(a: number[], b: number[]) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  it("cada pieza tiene una base ortonormal (rotación válida)", () => {
    const model = buildOpenBox(DEFAULT_CONFIG);
    for (const p of model.pieces) {
      const { xAxis, yAxis, zAxis } = p.assembly;
      expect(dot(xAxis, xAxis)).toBeCloseTo(1, 6);
      expect(dot(yAxis, yAxis)).toBeCloseTo(1, 6);
      expect(dot(zAxis, zAxis)).toBeCloseTo(1, 6);
      expect(dot(xAxis, yAxis)).toBeCloseTo(0, 6);
      expect(dot(xAxis, zAxis)).toBeCloseTo(0, 6);
      expect(dot(yAxis, zAxis)).toBeCloseTo(0, 6);
    }
  });
});

// --- Unidades --------------------------------------------------------------

describe("unidades", () => {
  it("6 in = 152.4 mm y round-trip", () => {
    expect(toMm(6, "in")).toBeCloseTo(152.4, 6);
    expect(fromMm(152.4, "in")).toBeCloseTo(6, 6);
    expect(toMm(fromMm(123.45, "in"), "in")).toBeCloseTo(123.45, 6);
    expect(MM_PER_INCH).toBe(25.4);
  });

  it("una caja definida en pulgadas equivale a la de mm", () => {
    const mmCfg = cloneConfig(DEFAULT_CONFIG);
    const inCfg = cloneConfig(DEFAULT_CONFIG);
    inCfg.inner = {
      width: toMm(fromMm(150, "in"), "in"),
      depth: toMm(fromMm(100, "in"), "in"),
      height: toMm(fromMm(50, "in"), "in"),
    };
    const a = buildOpenBox(mmCfg).outer;
    const b = buildOpenBox(inCfg).outer;
    expect(a.width).toBeCloseTo(b.width, 6);
    expect(a.depth).toBeCloseTo(b.depth, 6);
  });
});

// --- Dientes / complementariedad ------------------------------------------

describe("dientes", () => {
  it("resolveToothCount da un nº impar >= 3", () => {
    for (const len of [20, 50, 53, 106, 156]) {
      const { count } = resolveToothCount(len, 9);
      expect(count % 2).toBe(1);
      expect(count).toBeGreaterThanOrEqual(3);
    }
  });

  it("bordes complementarios: tab vs notch opuestos (fit=0)", () => {
    const length = 50;
    const { count } = resolveToothCount(length, 9);
    const t = 3;
    const a = fingerEdge({ length, count, depth: t, startTab: true, fit: 0 });
    const b = fingerEdge({ length, count, depth: t, startTab: false, fit: 0 });
    const w = length / count;
    for (let i = 0; i < count; i++) {
      const mid = (i + 0.5) * w;
      const ya = yAt(a, mid);
      const yb = yAt(b, mid);
      // Uno está en el diente (t) y el otro en la muesca (0).
      expect(ya + yb).toBeCloseTo(t, 6);
      expect(Math.min(ya, yb)).toBeCloseTo(0, 6);
      expect(Math.max(ya, yb)).toBeCloseTo(t, 6);
    }
  });
});

// --- Contornos -------------------------------------------------------------

describe("contornos", () => {
  it("todas las piezas son contornos cerrados sin puntos duplicados consecutivos", () => {
    const model = buildOpenBox(DEFAULT_CONFIG);
    for (const p of model.pieces) {
      expect(p.outline.length).toBeGreaterThanOrEqual(4);
      expect(hasDuplicateConsecutive(p.outline)).toBe(false);
      expect(Math.abs(signedArea(p.outline))).toBeGreaterThan(1);
    }
  });

  it("la geometría se conserva entre modelo y bbox esperado de paredes", () => {
    const model = buildOpenBox(DEFAULT_CONFIG);
    const front = model.pieces.find((p) => p.id === "front")!;
    const bb = bbox(front.outline);
    // Ancho = exterior 156; alto = altura pared (50) + lengüeta inferior (3).
    expect(bb.w).toBeCloseTo(156, 6);
    expect(bb.h).toBeCloseTo(53, 6);
  });
});

// --- Kerf ------------------------------------------------------------------

describe("kerf", () => {
  const square: Contour = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it("contorno exterior crece con kerf (hacia afuera)", () => {
    const k = 0.2;
    const out = offsetContour(square, k / 2, true);
    const bb = bbox(out);
    expect(bb.w).toBeCloseTo(10 + k, 6);
    expect(bb.h).toBeCloseTo(10 + k, 6);
  });

  it("hueco se achica con kerf (hacia el desperdicio interior)", () => {
    const k = 0.2;
    const { holes } = applyKerf(square, [square], k);
    const bb = bbox(holes[0]);
    expect(bb.w).toBeCloseTo(10 - k, 6);
    expect(bb.h).toBeCloseTo(10 - k, 6);
  });

  it("sin kerf no modifica la geometría (sin doble compensación)", () => {
    const r = applyKerf(square, [], 0);
    expect(r.outline).toEqual(square);
  });
});

// --- Validación ------------------------------------------------------------

describe("validación", () => {
  it("rechaza medidas no positivas", () => {
    const bad = cloneConfig(DEFAULT_CONFIG);
    bad.inner.width = 0;
    expect(() => validateConfig(bad)).toThrow(ConfigError);
  });

  it("rechaza valores no finitos", () => {
    const bad = cloneConfig(DEFAULT_CONFIG);
    bad.thickness = NaN;
    expect(() => validateConfig(bad)).toThrow(ConfigError);
  });

  it("rechaza espesor incompatible", () => {
    const bad = cloneConfig(DEFAULT_CONFIG);
    bad.thickness = 60; // > mitad de la dimensión menor (50)
    expect(() => validateConfig(bad)).toThrow(ConfigError);
  });

  it("rechaza diente demasiado grande", () => {
    const bad = cloneConfig(DEFAULT_CONFIG);
    bad.toothTarget = 30; // 3*30=90 > altura 50
    expect(() => validateConfig(bad)).toThrow(ConfigError);
  });
});

// --- Serialización ---------------------------------------------------------

describe("serialización", () => {
  it("guardar/cargar JSON conserva la configuración", () => {
    const json = serializeConfig(DEFAULT_CONFIG);
    const back = deserializeConfig(json);
    expect(back).toEqual(DEFAULT_CONFIG);
  });

  it("tolera campos faltantes mezclando con defaults", () => {
    const back = deserializeConfig('{"inner":{"width":200}}');
    expect(back.inner.width).toBe(200);
    expect(back.inner.depth).toBe(DEFAULT_CONFIG.inner.depth);
    expect(back.thickness).toBe(DEFAULT_CONFIG.thickness);
  });
});
