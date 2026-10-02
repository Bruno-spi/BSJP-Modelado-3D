// Disposición de piezas en el plano de corte (sin alterar su escala).
import type { Contour, Piece, Point } from "../core/types";

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
}

export function bboxOf(contours: Contour[]): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const c of contours) {
    for (const p of c) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export interface PlacedPiece {
  piece: Piece;
  /** Traslación aplicada para ubicar la pieza (mm). */
  offset: Point;
  bbox: BBox;
}

export interface LayoutResult {
  placed: PlacedPiece[];
  /** Tamaño total de la lámina (mm), incluyendo márgenes. */
  sheet: { width: number; height: number };
}

export interface LayoutOptions {
  margin: number; // margen alrededor de todo (mm)
  spacing: number; // separación entre piezas (mm)
  /** Ancho máximo de fila antes de saltar (mm). 0 = una sola fila. */
  maxRowWidth?: number;
}

/**
 * Disposición rectangular simple por filas (no es nesting optimizado).
 * No escala las piezas: solo las traslada manteniendo márgenes y separación.
 */
export function layoutPieces(pieces: Piece[], opts: LayoutOptions): LayoutResult {
  const { margin, spacing } = opts;
  const maxRow = opts.maxRowWidth && opts.maxRowWidth > 0 ? opts.maxRowWidth : Infinity;

  const placed: PlacedPiece[] = [];
  let cursorX = margin;
  let cursorY = margin;
  let rowH = 0;
  let sheetW = margin;

  for (const piece of pieces) {
    if (piece.hiddenInViewer) {
      // Oculta en visor NO implica excluir del corte; la exportación decide aparte.
    }
    const bbox = bboxOf([piece.outline, ...piece.holes]);
    if (cursorX > margin && cursorX + bbox.w > maxRow) {
      // Salto de fila.
      cursorX = margin;
      cursorY += rowH + spacing;
      rowH = 0;
    }
    const offset: Point = { x: cursorX - bbox.minX, y: cursorY - bbox.minY };
    placed.push({ piece, offset, bbox });
    cursorX += bbox.w + spacing;
    sheetW = Math.max(sheetW, cursorX - spacing + margin);
    rowH = Math.max(rowH, bbox.h);
  }

  const sheetH = cursorY + rowH + margin;
  return { placed, sheet: { width: sheetW, height: sheetH } };
}
