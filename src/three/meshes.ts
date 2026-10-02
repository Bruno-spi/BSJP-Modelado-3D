// Construcción de mallas 3D a partir del MISMO modelo geométrico (contornos
// reales con encastres). Cada pieza se extruye a lo largo de su zAxis y se
// ubica con la base de ensamblaje. La vista de despiece desplaza cada pieza
// a lo largo de su explodeDir.
import * as THREE from "three";
import type { BoxModel, Contour, Piece } from "../core/types";

function shapeFromContour(outline: Contour, holes: Contour[]): THREE.Shape {
  const shape = new THREE.Shape();
  outline.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  for (const h of holes) {
    const path = new THREE.Path();
    h.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

export interface MeshBuildOptions {
  /** Distancia de despiece en mm (0 = ensamblada). */
  explode: number;
  color: number;
  edgeColor: number;
  /** Centro del modelo para centrar la escena. */
  center: THREE.Vector3;
  hiddenIds: Set<string>;
}

export interface BuiltPiece {
  id: string;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
}

/** Devuelve un grupo con una malla + aristas por pieza. Recordá hacer dispose. */
export function buildPieceMeshes(model: BoxModel, opts: MeshBuildOptions): {
  group: THREE.Group;
  built: BuiltPiece[];
} {
  const group = new THREE.Group();
  const built: BuiltPiece[] = [];

  for (const piece of model.pieces) {
    if (opts.hiddenIds.has(piece.id)) continue;
    const mesh = makeMesh(piece, opts);
    group.add(mesh.mesh);
    group.add(mesh.edges);
    built.push({ id: piece.id, mesh: mesh.mesh, edges: mesh.edges });
  }
  // Centrar la escena en el origen.
  group.position.sub(opts.center);
  return { group, built };
}

function makeMesh(piece: Piece, opts: MeshBuildOptions) {
  const shape = shapeFromContour(piece.outline, piece.holes);
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: piece.thickness,
    bevelEnabled: false,
    steps: 1,
  });

  const a = piece.assembly;
  const x = new THREE.Vector3(...a.xAxis);
  const y = new THREE.Vector3(...a.yAxis);
  const z = new THREE.Vector3(...a.zAxis);
  const explode = new THREE.Vector3(...a.explodeDir).multiplyScalar(opts.explode);
  const pos = new THREE.Vector3(...a.position).add(explode);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(pos);
  geom.applyMatrix4(m);

  const material = new THREE.MeshStandardMaterial({
    color: opts.color,
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, material);
  mesh.name = piece.id;

  const edgeGeom = new THREE.EdgesGeometry(geom, 20);
  const edges = new THREE.LineSegments(
    edgeGeom,
    new THREE.LineBasicMaterial({ color: opts.edgeColor }),
  );
  return { mesh, edges };
}

/** Centro aproximado del modelo (en mm) para encuadrar la cámara. */
export function modelCenter(model: BoxModel): THREE.Vector3 {
  return new THREE.Vector3(
    model.outer.width / 2,
    model.outer.depth / 2,
    model.outer.height / 2,
  );
}

/** Libera geometrías y materiales de un grupo. */
export function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const any = obj as THREE.Mesh | THREE.LineSegments;
    if ((any as THREE.Mesh).geometry) (any as THREE.Mesh).geometry.dispose();
    const mat = (any as THREE.Mesh).material;
    if (mat) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else (mat as THREE.Material).dispose();
    }
  });
}
