// Configuración por defecto y (de)serialización versionada.
import type { BoxConfig } from "./types";

export const SCHEMA_VERSION = 1;

/** Valores provisionales acordados: mm, caja abierta 150x100x50, t=3, diente 9, kerf 0. */
export const DEFAULT_CONFIG: BoxConfig = {
  schema: SCHEMA_VERSION,
  displayUnit: "mm",
  measure: "inner",
  inner: { width: 150, depth: 100, height: 50 },
  thickness: 3,
  toothTarget: 9,
  kerf: 0,
  fit: 0,
  lid: "none",
  overlay: { overlap: 15, gap: 0.5 },
  hinge: { pinDiameter: 3, knuckles: 5, clearance: 0.4 },
  dividers: { countX: 0, countY: 0 },
};

export function cloneConfig(cfg: BoxConfig): BoxConfig {
  return JSON.parse(JSON.stringify(cfg));
}

export function serializeConfig(cfg: BoxConfig): string {
  return JSON.stringify(cfg, null, 2);
}

/** Carga y migra una configuración desde JSON. Lanza si es inválida. */
export function deserializeConfig(json: string): BoxConfig {
  const raw = JSON.parse(json) as Partial<BoxConfig>;
  if (typeof raw !== "object" || raw === null) {
    throw new Error("JSON de configuración inválido.");
  }
  // Mezcla con defaults para tolerar versiones viejas / campos faltantes.
  const merged: BoxConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    inner: { ...DEFAULT_CONFIG.inner, ...(raw.inner ?? {}) },
    overlay: { ...DEFAULT_CONFIG.overlay, ...(raw.overlay ?? {}) },
    hinge: { ...DEFAULT_CONFIG.hinge, ...(raw.hinge ?? {}) },
    dividers: { ...DEFAULT_CONFIG.dividers, ...(raw.dividers ?? {}) },
    schema: SCHEMA_VERSION,
  };
  return merged;
}
