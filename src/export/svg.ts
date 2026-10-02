// Exportación SVG real para corte láser. 1 unidad = 1 mm.
import type { BoxModel, Contour, Piece } from "../core/types";
import { applyKerf } from "../core/offset";
import { layoutPieces, type LayoutOptions, type PlacedPiece } from "./layout";

export interface SvgStyleOptions {
  /** Color de las líneas de corte. */
  cutColor: string;
  /** Grosor de línea de corte (mm). Fino para que LightBurn lo lea como vector. */
  cutWidth: number;
  /** Color de grabado. */
  engraveColor: string;
  /** Mostrar etiquetas de pieza como grabado (si no, van fuera del corte). */
  labelsAsEngraving: boolean;
}

export interface SvgExportOptions extends LayoutOptions {
  kerf: number;
  style: SvgStyleOptions;
  /** Excluir piezas marcadas como ocultas (por defecto NO se excluyen). */
  excludeHidden?: boolean;
}

export const DEFAULT_SVG_STYLE: SvgStyleOptions = {
  cutColor: "#000000",
  cutWidth: 0.1,
  engraveColor: "#ff0000",
  labelsAsEngraving: false,
};

function contourToPath(c: Contour, dx: number, dy: number): string {
  if (c.length === 0) return "";
  const r = (n: number) => {
    const v = Math.round((n + Number.EPSILON) * 1000) / 1000;
    return Object.is(v, -0) ? 0 : v;
  };
  let d = `M ${r(c[0].x + dx)} ${r(c[0].y + dy)}`;
  for (let i = 1; i < c.length; i++) {
    d += ` L ${r(c[i].x + dx)} ${r(c[i].y + dy)}`;
  }
  d += " Z";
  return d;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) =>
    ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch === '"' ? "&quot;" : "&apos;",
  );
}

/** Genera el SVG completo (lámina con todas las piezas dispuestas). */
export function exportSvg(model: BoxModel, opts: SvgExportOptions): string {
  const pieces = opts.excludeHidden
    ? model.pieces.filter((p) => !p.hiddenInViewer)
    : model.pieces;

  // Aplicar kerf a cada pieza (una sola vez).
  const kerfed: Piece[] = pieces.map((p) => {
    const k = applyKerf(p.outline, p.holes, opts.kerf);
    return { ...p, outline: k.outline, holes: k.holes };
  });

  const layout = layoutPieces(kerfed, opts);
  const { width, height } = layout.sheet;
  const { style } = opts;

  const cutPaths: string[] = [];
  const labels: string[] = [];
  for (const placed of layout.placed as PlacedPiece[]) {
    const { piece, offset } = placed;
    cutPaths.push(`    <path d="${contourToPath(piece.outline, offset.x, offset.y)}" />`);
    for (const h of piece.holes) {
      cutPaths.push(`    <path d="${contourToPath(h, offset.x, offset.y)}" />`);
    }
    const cx = offset.x + placed.bbox.minX + placed.bbox.w / 2;
    const cy = offset.y + placed.bbox.minY + placed.bbox.h / 2;
    labels.push(
      `    <text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-size="4" text-anchor="middle" dominant-baseline="middle">${escapeXml(piece.label)}</text>`,
    );
  }

  const cutGroup =
    `  <g id="corte" fill="none" stroke="${style.cutColor}" stroke-width="${style.cutWidth}">\n` +
    cutPaths.join("\n") +
    `\n  </g>`;

  const labelGroup = style.labelsAsEngraving
    ? `  <g id="grabado-etiquetas" fill="${style.engraveColor}" stroke="none">\n` +
      labels.join("\n") +
      `\n  </g>`
    : `  <g id="etiquetas" fill="#999999" stroke="none">\n` + labels.join("\n") + `\n  </g>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width.toFixed(2)}mm" height="${height.toFixed(2)}mm" ` +
    `viewBox="0 0 ${width.toFixed(3)} ${height.toFixed(3)}">\n` +
    cutGroup +
    `\n` +
    labelGroup +
    `\n</svg>\n`
  );
}
