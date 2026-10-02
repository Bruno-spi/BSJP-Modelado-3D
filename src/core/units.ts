// Normalización de unidades. Internamente SIEMPRE mm.
import type { DimUnit } from "./types";

export const MM_PER_INCH = 25.4;

/** Convierte un valor en la unidad dada a mm. */
export function toMm(value: number, unit: DimUnit): number {
  return unit === "in" ? value * MM_PER_INCH : value;
}

/** Convierte mm a la unidad de visualización. */
export function fromMm(valueMm: number, unit: DimUnit): number {
  return unit === "in" ? valueMm / MM_PER_INCH : valueMm;
}

/** Formatea un valor en mm para mostrar en la unidad dada, con decimales. */
export function formatLength(valueMm: number, unit: DimUnit, decimals = 2): string {
  const v = fromMm(valueMm, unit);
  return `${v.toFixed(decimals)} ${unit}`;
}

/** True si el número es finito y utilizable como medida. */
export function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
