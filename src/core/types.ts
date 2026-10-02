// Modelo de datos canónico. Todo se almacena en MILÍMETROS.
// La unidad de visualización es solo para la interfaz.

export type DimUnit = "mm" | "in";

/** Un punto 2D en el plano de corte, en mm. */
export interface Point {
  x: number;
  y: number;
}

/** Un contorno cerrado como lista de puntos (sin repetir el primero al final). */
export type Contour = Point[];

/** Tipo de tapa superior de la caja. */
export type LidType = "none" | "flat" | "overlay" | "hinged";

/** Parámetros de la tapa sobrepuesta (encaja por fuera del borde superior). */
export interface OverlayLidConfig {
  /** Altura de la falda que solapa las paredes (mm). */
  overlap: number;
  /** Holgura por lado entre la falda y la caja (mm). */
  gap: number;
}

/** Parámetros de la bisagra de pin (une la tapa a la pared trasera). */
export interface HingeConfig {
  /** Diámetro del pin (mm). */
  pinDiameter: number;
  /** Nº de nudillos (knuckles) a lo largo del eje. Impar recomendado. */
  knuckles: number;
  /** Holgura radial y lateral de la bisagra (mm). */
  clearance: number;
}

/** Esquema de compensación de kerf usado por el motor. */
export type KerfScheme = "none" | "outset";

/**
 * Configuración serializable y versionada de la caja.
 * Las dimensiones interiores están SIEMPRE en mm.
 */
export interface BoxConfig {
  /** Versión del esquema de configuración, para migraciones. */
  schema: number;
  /** Unidad mostrada en la interfaz (no afecta el almacenamiento). */
  displayUnit: DimUnit;
  /** Si las dimensiones ingresadas son interiores o exteriores. */
  measure: "inner" | "outer";
  /** Dimensiones ingresadas en mm (interiores o exteriores según `measure`). */
  inner: { width: number; depth: number; height: number };
  /** Espesor del material en mm. */
  thickness: number;
  /** Tamaño objetivo de diente en mm (el real puede ajustarse por borde). */
  toothTarget: number;
  /** Ancho total de material removido por el láser, en mm. 0 = sin calibrar. */
  kerf: number;
  /**
   * Holgura de encastre en mm (positiva = más flojo). Se suma al hueco de los
   * machihembrados. Independiente del kerf.
   */
  fit: number;
  /** Tipo de tapa. */
  lid: LidType;
  /** Parámetros de la tapa sobrepuesta. */
  overlay: OverlayLidConfig;
  /** Parámetros de la bisagra de pin. */
  hinge: HingeConfig;
  /** Divisores internos. */
  dividers: DividerConfig;
}

export interface DividerConfig {
  /** Nº de divisores paralelos al eje Y (parten el ancho X). */
  countX: number;
  /** Nº de divisores paralelos al eje X (parten la profundidad Y). */
  countY: number;
  /**
   * Posiciones personalizadas (fracción 0..1 del interior) por eje.
   * Si está vacío se usa distribución uniforme según count.
   */
  customX?: number[];
  customY?: number[];
  /**
   * Unión de celdas: tramos de divisor quitados para fusionar celdas vecinas.
   * Cada entrada identifica un divisor y el índice de tramo a omitir.
   * axis "x": divisor X (parte el ancho); "y": divisor Y.
   * index: posición del divisor (0-based en el orden de posiciones).
   * segment: tramo entre soportes (0-based), contando desde el origen del eje
   * que recorre el divisor.
   */
  merges?: Array<{ axis: "x" | "y"; index: number; segment: number }>;
}

/** Una operación de grabado (no de corte). */
export interface Engraving {
  kind: "text" | "path";
  /** Trayectoria o posición en coordenadas de la pieza (mm). */
  path?: Contour;
  text?: string;
  at?: Point;
  size?: number;
}

/**
 * Transformada para ensamblar la pieza en el espacio 3D (mm).
 * Se define por una base: las imágenes en coordenadas de mundo de los ejes
 * locales de la pieza. El eje local Z es también la dirección de extrusión
 * (el espesor crece a lo largo de zAxis). El plano 2D de corte usa (u,v) =
 * ejes locales X,Y; así el SVG y la malla 3D derivan del MISMO contorno.
 */
export interface Assembly {
  /** Punto de mundo correspondiente al origen local (0,0,0), en mm. */
  position: [number, number, number];
  /** Imagen en mundo del eje local X (dirección de u). */
  xAxis: [number, number, number];
  /** Imagen en mundo del eje local Y (dirección de v). */
  yAxis: [number, number, number];
  /** Imagen en mundo del eje local Z (dirección de extrusión = espesor). */
  zAxis: [number, number, number];
  /** Dirección unitaria hacia afuera, usada para la vista de despiece. */
  explodeDir: [number, number, number];
}

/**
 * Pieza canónica. De este modelo se derivan tanto el SVG 2D como la malla 3D.
 */
export interface Piece {
  id: string;
  label: string;
  /** Contorno exterior cerrado (sin relleno, para corte), en mm. */
  outline: Contour;
  /** Huecos interiores (ranuras/mortajas), cada uno un contorno cerrado. */
  holes: Contour[];
  /** Espesor de extrusión en mm. */
  thickness: number;
  /** Cómo se coloca la pieza en el ensamblaje 3D. */
  assembly: Assembly;
  /** Grabados opcionales. */
  engravings?: Engraving[];
  /** Si está oculta en el visor 3D. NO afecta la exportación de corte. */
  hiddenInViewer?: boolean;
}

/** Resultado del motor: piezas + metadatos de diagnóstico. */
export interface BoxModel {
  pieces: Piece[];
  /** Dimensiones exteriores calculadas en mm. */
  outer: { width: number; depth: number; height: number };
  /** Avisos no fatales (p. ej. diente efectivo distinto del objetivo). */
  warnings: string[];
}
