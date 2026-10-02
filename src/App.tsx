import { useEffect, useMemo, useRef, useState } from "react";
import type { BoxConfig, DimUnit } from "./core/types";
import { DEFAULT_CONFIG, cloneConfig, serializeConfig, deserializeConfig } from "./core/config";
import { buildOpenBox } from "./core/geometry";
import { exportSvg, DEFAULT_SVG_STYLE } from "./export/svg";
import { fromMm, toMm, formatLength } from "./core/units";
import { Viewer3D } from "./ui/Viewer3D";

const ACCENTS = ["#4f9dff", "#2f81f7", "#36d399", "#f471b5", "#fbbf24", "#a78bfa"];
const PIECE_LABELS: Record<string, string> = {
  bottom: "Fondo",
  front: "Frente",
  back: "Trasera",
  left: "Lateral izq.",
  right: "Lateral der.",
};

interface History {
  past: BoxConfig[];
  present: BoxConfig;
  future: BoxConfig[];
}

export function App() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: cloneConfig(DEFAULT_CONFIG),
    future: [],
  });
  const cfg = history.present;
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [customDiv, setCustomDiv] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setCfg = (updater: BoxConfig | ((c: BoxConfig) => BoxConfig)) =>
    setHistory((h) => {
      const next = typeof updater === "function" ? (updater as (c: BoxConfig) => BoxConfig)(h.present) : updater;
      if (next === h.present) return h;
      return { past: [...h.past, h.present], present: next, future: [] };
    });
  const undo = () =>
    setHistory((h) =>
      h.past.length
        ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
        : h,
    );
  const redo = () =>
    setHistory((h) =>
      h.future.length
        ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
        : h,
    );

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Regenera el modelo y el SVG en cada cambio (invalida cualquier caché).
  const result = useMemo(() => {
    try {
      const model = buildOpenBox(cfg);
      const svg = exportSvg(model, {
        margin: 5,
        spacing: 5,
        maxRowWidth: 0,
        kerf: cfg.kerf,
        style: DEFAULT_SVG_STYLE,
        excludeHidden: false, // ocultar en visor NO excluye del corte
      });
      return { model, svg, error: null as string | null };
    } catch (e) {
      return { model: null, svg: "", error: (e as Error).message };
    }
  }, [cfg]);

  const u = cfg.displayUnit;
  const setInner = (k: "width" | "depth" | "height", displayVal: number) =>
    setCfg((c) => ({ ...c, inner: { ...c.inner, [k]: toMm(displayVal, u) } }));
  const setNum = (k: "thickness" | "toothTarget" | "kerf" | "fit", displayVal: number) =>
    setCfg((c) => ({ ...c, [k]: toMm(displayVal, u) }));

  const dv = (mm: number) => Number(fromMm(mm, u).toFixed(u === "in" ? 4 : 2));

  const setDividerCount = (k: "countX" | "countY", val: number) =>
    setCfg((c) => ({ ...c, dividers: { ...c.dividers, [k]: Math.max(0, Math.floor(val)) } }));

  const parseFracs = (txt: string): number[] =>
    txt
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0 && n < 1);

  const setCustomFracs = (k: "customX" | "customY", txt: string) =>
    setCfg((c) => ({ ...c, dividers: { ...c.dividers, [k]: parseFracs(txt) } }));

  const toggleCustomDiv = (on: boolean) => {
    setCustomDiv(on);
    setCfg((c) => ({
      ...c,
      dividers: on
        ? { ...c.dividers, customX: c.dividers.customX ?? [], customY: c.dividers.customY ?? [] }
        : { countX: c.dividers.countX, countY: c.dividers.countY },
    }));
  };

  const triggerDownload = (data: string, type: string, name: string) => {
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadSvg = () =>
    triggerDownload(
      result.svg,
      "image/svg+xml",
      `jplaser_${cfg.inner.width}x${cfg.inner.depth}x${cfg.inner.height}.svg`,
    );
  const saveJson = () =>
    triggerDownload(serializeConfig(cfg), "application/json", "jplaser_proyecto.json");

  const loadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setCfg(deserializeConfig(String(reader.result)));
      } catch (err) {
        alert("No se pudo cargar: " + (err as Error).message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" />
          JP Laser Studio
        </div>
        <div className="brand">
          <small>Generador paramétrico para corte láser · Etapa 2</small>
        </div>

        <div className="section">
          <h3>Unidades</h3>
          <div className="unit-toggle">
            {(["mm", "in"] as DimUnit[]).map((unit) => (
              <button
                key={unit}
                className={u === unit ? "active" : ""}
                onClick={() => setCfg((c) => ({ ...c, displayUnit: unit }))}
              >
                {unit}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Tipo de medida</h3>
          <div className="unit-toggle">
            {(["inner", "outer"] as const).map((m) => (
              <button
                key={m}
                className={cfg.measure === m ? "active" : ""}
                onClick={() => setCfg((c) => ({ ...c, measure: m }))}
              >
                {m === "inner" ? "Interiores" : "Exteriores"}
              </button>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Dimensiones {cfg.measure === "inner" ? "interiores" : "exteriores"}</h3>
          <div className="row">
            <div className="field">
              <label>Ancho (X)</label>
              <input type="number" value={dv(cfg.inner.width)} step="any"
                onChange={(e) => setInner("width", +e.target.value)} />
            </div>
            <div className="field">
              <label>Profundidad (Y)</label>
              <input type="number" value={dv(cfg.inner.depth)} step="any"
                onChange={(e) => setInner("depth", +e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Altura (Z)</label>
            <input type="number" value={dv(cfg.inner.height)} step="any"
              onChange={(e) => setInner("height", +e.target.value)} />
          </div>
        </div>

        <div className="section">
          <h3>Material y encastre</h3>
          <div className="row">
            <div className="field">
              <label>Espesor</label>
              <input type="number" value={dv(cfg.thickness)} step="any"
                onChange={(e) => setNum("thickness", +e.target.value)} />
            </div>
            <div className="field">
              <label>Diente objetivo</label>
              <input type="number" value={dv(cfg.toothTarget)} step="any"
                onChange={(e) => setNum("toothTarget", +e.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Kerf</label>
              <input type="number" value={dv(cfg.kerf)} step="any"
                onChange={(e) => setNum("kerf", +e.target.value)} />
            </div>
            <div className="field">
              <label>Holgura (fit)</label>
              <input type="number" value={dv(cfg.fit)} step="any"
                onChange={(e) => setNum("fit", +e.target.value)} />
            </div>
          </div>
          <p className="hint">
            Dejá el kerf en 0 hasta calibrar con una probeta en tu material y máquina.
            Holgura y kerf son independientes: no los compenses dos veces en LightBurn.
          </p>
        </div>

        <div className="section">
          <h3>Construcción (tapa)</h3>
          <div className="unit-toggle" style={{ flexWrap: "wrap" }}>
            {([
              ["none", "Abierta"],
              ["flat", "Plana"],
              ["overlay", "Sobrepuesta"],
              ["hinged", "Bisagra"],
            ] as const).map(([l, label]) => (
              <button
                key={l}
                className={cfg.lid === l ? "active" : ""}
                style={{ flex: "1 0 45%" }}
                onClick={() => setCfg((c) => ({ ...c, lid: l }))}
              >
                {label}
              </button>
            ))}
          </div>
          {cfg.lid === "overlay" && (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="field">
                <label>Solape</label>
                <input type="number" value={dv(cfg.overlay.overlap)} step="any"
                  onChange={(e) => setCfg((c) => ({ ...c, overlay: { ...c.overlay, overlap: toMm(+e.target.value, u) } }))} />
              </div>
              <div className="field">
                <label>Holgura tapa</label>
                <input type="number" value={dv(cfg.overlay.gap)} step="any"
                  onChange={(e) => setCfg((c) => ({ ...c, overlay: { ...c.overlay, gap: toMm(+e.target.value, u) } }))} />
              </div>
            </div>
          )}
          {cfg.lid === "hinged" && (
            <>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Ø pin</label>
                  <input type="number" value={dv(cfg.hinge.pinDiameter)} step="any"
                    onChange={(e) => setCfg((c) => ({ ...c, hinge: { ...c.hinge, pinDiameter: toMm(+e.target.value, u) } }))} />
                </div>
                <div className="field">
                  <label>Nudillos</label>
                  <input type="number" min={3} value={cfg.hinge.knuckles}
                    onChange={(e) => setCfg((c) => ({ ...c, hinge: { ...c.hinge, knuckles: Math.max(3, Math.floor(+e.target.value)) } }))} />
                </div>
                <div className="field">
                  <label>Holgura</label>
                  <input type="number" value={dv(cfg.hinge.clearance)} step="any"
                    onChange={(e) => setCfg((c) => ({ ...c, hinge: { ...c.hinge, clearance: toMm(+e.target.value, u) } }))} />
                </div>
              </div>
              <p className="hint">Bisagra sin verificar físicamente: hacé un corte de prueba. El pin es una varilla aparte.</p>
            </>
          )}
        </div>

        <div className="section">
          <h3>Divisores</h3>
          <label className="piece-row" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={customDiv} onChange={(e) => toggleCustomDiv(e.target.checked)} />
            Posiciones personalizadas
          </label>
          {customDiv ? (
            <>
              <div className="field">
                <label>Fracciones X (0–1, coma)</label>
                <input type="text" defaultValue={(cfg.dividers.customX ?? []).join(", ")}
                  placeholder="0.33, 0.66"
                  onChange={(e) => setCustomFracs("customX", e.target.value)} />
              </div>
              <div className="field">
                <label>Fracciones Y (0–1, coma)</label>
                <input type="text" defaultValue={(cfg.dividers.customY ?? []).join(", ")}
                  placeholder="0.5"
                  onChange={(e) => setCustomFracs("customY", e.target.value)} />
              </div>
            </>
          ) : (
            <div className="row">
              <div className="field">
                <label>En X</label>
                <input type="number" min={0} value={cfg.dividers.countX}
                  onChange={(e) => setDividerCount("countX", +e.target.value)} />
              </div>
              <div className="field">
                <label>En Y</label>
                <input type="number" min={0} value={cfg.dividers.countY}
                  onChange={(e) => setDividerCount("countY", +e.target.value)} />
              </div>
            </div>
          )}
          <p className="hint">Media madera en los cruces; espigas en las paredes.</p>
        </div>

        <div className="section">
          <h3>Piezas (visor)</h3>
          <div className="piece-list">
            {result.model?.pieces.map((p) => (
              <label key={p.id} className="piece-row">
                <input
                  type="checkbox"
                  checked={!hidden.has(p.id)}
                  onChange={() => toggleHidden(p.id)}
                />
                {PIECE_LABELS[p.id] ?? p.label}
              </label>
            ))}
          </div>
          <p className="hint">Ocultar una pieza acá no la quita del archivo de corte.</p>
          <button onClick={() => setHidden(new Set())} disabled={hidden.size === 0}>
            Mostrar todas
          </button>
        </div>

        <div className="section">
          <h3>Acento</h3>
          <div className="accent-row">
            {ACCENTS.map((c) => (
              <div key={c} className={"swatch" + (accent === c ? " active" : "")}
                style={{ background: c }} onClick={() => setAccent(c)} />
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Proyecto</h3>
          <div className="row">
            <button onClick={saveJson}>Guardar JSON</button>
            <button onClick={() => fileRef.current?.click()}>Cargar JSON</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={loadJson} />
          </div>
        </div>
      </aside>

      <main className="viewer">
        <div className="toolbar">
          <div className="unit-toggle mode-toggle">
            <button className={mode === "3d" ? "active" : ""} onClick={() => setMode("3d")}>3D</button>
            <button className={mode === "2d" ? "active" : ""} onClick={() => setMode("2d")}>2D</button>
          </div>
          <button onClick={undo} disabled={!history.past.length} title="Deshacer (Ctrl+Z)">↶</button>
          <button onClick={redo} disabled={!history.future.length} title="Rehacer (Ctrl+Y)">↷</button>
          {result.model && (
            <>
              <span className="pill">Ext X <b>{formatLength(result.model.outer.width, u)}</b></span>
              <span className="pill">Ext Y <b>{formatLength(result.model.outer.depth, u)}</b></span>
              <span className="pill">Ext Z <b>{formatLength(result.model.outer.height, u)}</b></span>
            </>
          )}
          <div className="spacer" />
          <button className="primary" onClick={downloadSvg} disabled={!result.model}>
            Descargar SVG de corte
          </button>
        </div>

        <div className="stage">
          {result.error ? (
            <div className="error-wrap"><div className="error">⚠ {result.error}</div></div>
          ) : mode === "3d" && result.model ? (
            <Viewer3D model={result.model} accentHex={accent} hiddenIds={hidden} />
          ) : (
            <div className="canvas">
              <div dangerouslySetInnerHTML={{ __html: result.svg }} />
            </div>
          )}
          {result.model?.warnings.map((w, i) => (
            <div key={i} className="warn floating">⚠ {w}</div>
          ))}
        </div>
      </main>
    </div>
  );
}
