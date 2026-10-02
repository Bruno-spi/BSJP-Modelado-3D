<<<<<<< HEAD
# JP Laser Studio

Generador paramétrico de cajas para corte láser, con encastres *finger joint* y
exportación **SVG a escala real (1 unidad = 1 mm)** para LightBurn. Interfaz en
español, tema oscuro con acento azul configurable, panel a la izquierda y vista
3D a la derecha, adaptable a distintos tamaños de pantalla. Todo se calcula
internamente en milímetros. Sin registro, sin publicidad, sin servicios pagos.

> Nombre provisional (**JP Laser Studio**). Se renombra cuando quieras.

## Cómo ejecutarlo

```bash
npm install
npm run dev        # servidor de desarrollo en http://localhost:5173
```

Otros comandos:

```bash
npm run build      # build de producción en dist/
npm run preview    # sirve el build
npm test           # corre las pruebas (vitest)
npm run typecheck  # verificación de tipos
```

## Estado por etapas

- **Etapa 1 — Caja abierta (COMPLETA y verificada).**
  5 piezas con encastres funcionales: esquinas verticales con dientes
  complementarios y lengüetas inferiores que encajan en muescas del fondo.
  Medidas interiores/exteriores, espesor, tamaño objetivo de diente, vista 2D,
  SVG real, kerf/holgura separados, validación, guardar/cargar JSON.
- **Etapa 2 — Vista 3D (COMPLETA).**
  Vista 3D ensamblada derivada del MISMO modelo (extrusión de los contornos
  reales con encastres), rotación y zoom (OrbitControls), vista de **despiece**
  con deslizador, vistas **Iso / Planta / Frente / Lateral**, conmutador 2D/3D,
  visibilidad de piezas (ocultar en el visor NO las quita del corte), layout
  responsive y liberación de recursos gráficos al recomponer la escena.
- **Etapa 3 — Tapa plana y divisores (COMPLETA).**
  Tapa plana con encastre (las paredes ganan lengüetas superiores; altura
  exterior pasa a `interior + 2t`). Divisores en X e Y, **uniformes o en
  posiciones personalizadas** (por fracción), con **media madera** en los cruces
  y **espigas (mortaja-espiga)** contra las paredes. **Deshacer/rehacer**
  (botones y Ctrl+Z / Ctrl+Y) y **restaurar piezas ocultas** ("Mostrar todas").
  Ocultar una pieza en el visor no la quita del archivo de corte.
- **Etapa 4 — Tapa sobrepuesta y bisagra de pin (PARCIAL).**
  **Tapa sobrepuesta**: falda externa que encaja sobre el borde (parámetros
  solape y holgura); se construye con el mismo motor como caja invertida.
  **Bisagra de pin**: nudillos semicirculares intercalados entre la pared
  trasera y la tapa, con huecos de pin alineados; parámetros Ø pin, nudillos y
  holgura; valida que el pin entre en el nudillo. **Geometría 2D verificada; la
  rotación y el ajuste físico NO están comprobados** (requiere corte de prueba);
  la tapa se muestra en posición abierta y el pin es una varilla aparte.
  *Pendiente en esta etapa: unión de celdas (divisores parciales).*
- Etapa 5 — DXF y nesting optimizado. *(pendiente)*

## SVG de ejemplo

`ejemplo_caja_150x100x50.svg` (caja base, generado por el motor). Para
regenerarlo:

```bash
npx esbuild scripts/gen-example.ts --bundle --platform=node --format=esm --outfile=gen.mjs && node gen.mjs
```

## Arquitectura

```
src/core/        motor geométrico puro (sin DOM)
  types.ts       modelo canónico de piezas y configuración
  units.ts       normalización mm <-> pulgadas (25.4 mm/in)
  config.ts      configuración por defecto + (de)serialización versionada
  validation.ts  rechazo explícito de valores inválidos
  teeth.ts       generación de dientes (encastre caja y espiga)
  offset.ts      compensación de kerf por desplazamiento de contorno
  geometry.ts    construcción de la caja (abierta/tapa/divisores) -> BoxModel
  dividers.ts    divisores (media madera) + mortajas en paredes
  engine.test.ts pruebas del motor
src/export/      disposición y exportación
  layout.ts      disposición rectangular (sin escalar las piezas)
  svg.ts         SVG vectorial para corte (grupos corte/grabado)
src/three/       capa 3D
  meshes.ts      extrusión de los contornos + base de ensamblaje + despiece
src/ui/          interfaz React
  Viewer3D.tsx   escena Three.js (orbit, zoom, despiece, vistas orto)
  theme.css      tema oscuro + acento + responsive
src/App.tsx      editor de parámetros + visor 2D/3D + descargas
scripts/
  gen-example.ts generador del SVG de ejemplo
```

El modelo de piezas (`Piece`) es la única fuente: de él se derivan tanto el SVG
2D como (en la Etapa 2) la malla 3D. La configuración es serializable y
versionada; se guarda/carga como JSON.

## Convenciones geométricas importantes

- **Construcción**: caja abierta con **fondo debajo de las paredes**.
  Para espesor `t`: `ancho_ext = ancho_int + 2t`, `prof_ext = prof_int + 2t`,
  `altura_ext = altura_int + t`. (No son universales: se recalculan por
  construcción y por tapa.)
- **Kerf vs holgura**: son independientes.
  - La **holgura (`fit`)** ya está incorporada en el diseño nominal de los
    dientes (dientes un poco más angostos, muescas un poco más anchas).
  - El **kerf** se compensa UNA sola vez desplazando el centro de corte `k/2`
    hacia el desperdicio: hacia afuera en contornos exteriores y hacia adentro
    en los huecos. La pieza terminada recupera su medida nominal.
  - **No vuelvas a compensar el kerf en LightBurn**: si exportás con kerf > 0,
    dejá el "kerf offset" de LightBurn en 0.

## Verificación

Pruebas automáticas (`npm test`, 24 casos, todas en verde):

- Caso base interior 150×100×50, t=3 → **exterior 156×106×53**.
- Modo exterior: 156×106×53 externas producen la misma caja que 150×100×50
  internas (mismos contornos).
- Equivalencia pulgadas/mm (6 in = 152.4 mm; caja en in == caja en mm).
- Bordes complementarios (diente vs muesca opuestos).
- Contornos cerrados, sin puntos duplicados consecutivos, área no nula.
- Dirección del kerf: el contorno exterior crece, el hueco se achica; sin kerf
  no se modifica la geometría (sin doble compensación).
- Base de ensamblaje 3D ortonormal por pieza (coherencia 2D↔3D).
- Tapa plana: altura exterior = interior + 2t; la tapa comparte contorno con el
  fondo; la pared gana lengüetas arriba y abajo.
- Divisores: posiciones uniformes y personalizadas; mortajas por pared; media
  madera (ranuras a media altura); rechazo de divisores demasiado juntos.
- Rechazo de valores no finitos, no positivos, espesor y diente incompatibles.
- Guardar/cargar JSON conserva la configuración.

Verificación visual (en el navegador): caja ensamblada en 3D, vista de despiece
con las 5 piezas separadas mostrando los encastres reales, y el SVG de ejemplo
renderizado como archivo independiente.

### Pendiente de verificar físicamente

El **encastre real** depende del material y la máquina. No está garantizado un
ajuste perfecto sin un **corte de prueba (probeta de calibración)**: cortá una
muestra, medí el kerf efectivo y ajustá `kerf` y `fit`. Falta también la
verificación de importación a **escala 1:1 en LightBurn** (hacer cuando tengas
el software a mano).

Notas sobre divisores (Etapa 3): se unen a las paredes por mortaja-espiga y se
traban entre sí por media madera; **apoyan sobre el fondo** (todavía no llevan
ranura en el fondo). La espiga/ranura también requiere calibración física.
=======
# BSJP-Modelado-3D
Aplicacion de modelado 3d para maquinas de corte laser
>>>>>>> 89c9a0acceb6b5510a04b2b68ade87074bf90c6b
