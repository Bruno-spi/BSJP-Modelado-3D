// Validación de la configuración. Rechaza valores inválidos sin corregirlos.
import type { BoxConfig } from "./types";
import { isFiniteNumber } from "./units";

export class ConfigError extends Error {}

/** Lanza ConfigError si la configuración no es construible. */
export function validateConfig(cfg: BoxConfig): void {
  const req = (n: unknown, name: string) => {
    if (!isFiniteNumber(n)) throw new ConfigError(`${name} debe ser un número finito.`);
  };
  const pos = (n: number, name: string) => {
    if (!(n > 0)) throw new ConfigError(`${name} debe ser mayor que 0.`);
  };

  req(cfg.thickness, "El espesor");
  req(cfg.toothTarget, "El tamaño de diente");
  req(cfg.kerf, "El kerf");
  req(cfg.fit, "La holgura");
  req(cfg.inner?.width, "El ancho interior");
  req(cfg.inner?.depth, "La profundidad interior");
  req(cfg.inner?.height, "La altura interior");

  pos(cfg.thickness, "El espesor");
  pos(cfg.toothTarget, "El tamaño de diente");
  pos(cfg.inner.width, "El ancho interior");
  pos(cfg.inner.depth, "La profundidad interior");
  pos(cfg.inner.height, "La altura interior");

  if (cfg.kerf < 0) throw new ConfigError("El kerf no puede ser negativo.");
  if (cfg.fit < 0) throw new ConfigError("La holgura no puede ser negativa.");

  // El diente debe caber al menos 3 veces en cada borde con encastre.
  const minSide = Math.min(cfg.inner.width + 2 * cfg.thickness, cfg.inner.depth + 2 * cfg.thickness, cfg.inner.height);
  if (cfg.toothTarget * 3 > minSide) {
    throw new ConfigError(
      `El diente (${cfg.toothTarget} mm) es demasiado grande para el borde más corto (${minSide.toFixed(1)} mm); debe caber al menos 3 veces.`,
    );
  }

  // El espesor no puede exceder la mitad de la dimensión menor (encastre imposible).
  if (cfg.thickness * 2 >= Math.min(cfg.inner.width, cfg.inner.depth, cfg.inner.height)) {
    throw new ConfigError("El espesor es demasiado grande respecto de las dimensiones interiores.");
  }
}
