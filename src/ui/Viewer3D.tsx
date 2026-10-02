import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BoxModel } from "../core/types";
import { buildPieceMeshes, disposeGroup, modelCenter } from "../three/meshes";

interface Props {
  model: BoxModel;
  accentHex: string;
  hiddenIds: Set<string>;
}

type ViewPreset = "iso" | "top" | "front" | "side";

export function Viewer3D({ model, accentHex, hiddenIds }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const [explode, setExplode] = useState(0);

  // --- Inicialización única del renderer/escena/cámara ---
  useEffect(() => {
    const mount = mountRef.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1116);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 10000);
    camera.up.set(0, 0, 1); // Z es la altura

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(1, 1.5, 2);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1, -1, -0.5);
    scene.add(dir2);

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    rendererRef.current = renderer;

    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (groupRef.current) {
        scene.remove(groupRef.current);
        disposeGroup(groupRef.current);
      }
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  // --- Reconstruir la geometría cuando cambia el modelo/despiece/color/ocultas ---
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (groupRef.current) {
      scene.remove(groupRef.current);
      disposeGroup(groupRef.current);
      groupRef.current = null;
    }
    const accent = parseInt(accentHex.replace("#", ""), 16);
    const { group } = buildPieceMeshes(model, {
      explode,
      color: accent,
      edgeColor: 0x0b0e13,
      center: modelCenter(model),
      hiddenIds,
    });
    scene.add(group);
    groupRef.current = group;
  }, [model, explode, accentHex, hiddenIds]);

  // --- Encuadre inicial según el tamaño del modelo ---
  useEffect(() => {
    setView("iso");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.outer.width, model.outer.depth, model.outer.height]);

  const setView = (preset: ViewPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;
    const { width, depth, height } = model.outer;
    const r = Math.max(width, depth, height);
    const d = r * 2.1;
    controls.target.set(0, 0, 0);
    switch (preset) {
      case "top":
        camera.position.set(0, 0, d);
        break;
      case "front":
        camera.position.set(0, -d, 0);
        break;
      case "side":
        camera.position.set(d, 0, 0);
        break;
      default:
        camera.position.set(d * 0.8, -d * 0.9, d * 0.7);
    }
    camera.updateProjectionMatrix();
    controls.update();
  };

  return (
    <div className="viewer3d">
      <div className="v3d-canvas" ref={mountRef} />
      <div className="v3d-overlay">
        <div className="v3d-views">
          <button onClick={() => setView("iso")}>Iso</button>
          <button onClick={() => setView("top")}>Planta</button>
          <button onClick={() => setView("front")}>Frente</button>
          <button onClick={() => setView("side")}>Lateral</button>
        </div>
        <div className="v3d-explode">
          <label>Despiece</label>
          <input
            type="range"
            min={0}
            max={Math.round(Math.max(model.outer.width, model.outer.depth) * 0.9)}
            value={explode}
            onChange={(e) => setExplode(+e.target.value)}
          />
          <button onClick={() => setExplode(0)} disabled={explode === 0}>Ensamblar</button>
        </div>
      </div>
    </div>
  );
}
