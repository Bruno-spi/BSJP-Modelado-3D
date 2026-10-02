// Genera un SVG de ejemplo (caja 150x100x50, t=3, diente 9, kerf 0) a disco.
import { writeFileSync } from "node:fs";
import { buildOpenBox } from "../src/core/geometry";
import { DEFAULT_CONFIG } from "../src/core/config";
import { exportSvg, DEFAULT_SVG_STYLE } from "../src/export/svg";

const model = buildOpenBox(DEFAULT_CONFIG);
const svg = exportSvg(model, {
  margin: 5,
  spacing: 5,
  maxRowWidth: 0,
  kerf: DEFAULT_CONFIG.kerf,
  style: DEFAULT_SVG_STYLE,
});
writeFileSync("ejemplo_caja_150x100x50.svg", svg, "utf8");
console.log(
  `OK: ${model.pieces.length} piezas, exterior ${model.outer.width}x${model.outer.depth}x${model.outer.height} mm`,
);
