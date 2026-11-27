# Marea Vial · Reto 3 — Simulador 2D de la Glorieta de La Lucha (Santa Marta)

Simulador web en 2D de tráfico que modela la **Glorieta de La Lucha** (11.218753, -74.190173) en vista aérea de **dos niveles**, con el norte arriba como el mapa real. **Nivel inferior:** rotonda circular con isla verde y anillo de **2 carriles en sentido antihorario**; a la izquierda, la **Carrera 15** baja desde el noroeste en una sola calzada, se une **tangencialmente** al borde izquierdo del anillo y sigue en diagonal hacia el suroeste como **Carrera 15 Sur** (↓), con un borde exterior continuo; arriba a la derecha, la **Calle 40 / Paralela** de doble calzada; abajo a la derecha, la **Troncal del Caribe inferior**, una calzada curva de un sentido que sube y gira hacia la Troncal del Caribe rozando el borde inferior derecho del anillo, unida a él por **dos enlaces triangulares** (abajo entra al anillo; a la derecha recibe la salida del anillo). **Nivel superior:** el **Puente Ruta 90 (Troncal del Caribe)**, dos calzadas elevadas separadas que suben desde el suroeste, hacen un quiebre suave encima del cuadrante inferior derecho y siguen hacia el noreste, por encima de los enlaces. Compara tres formas de operar la glorieta:

| Modo | Qué representa |
|---|---|
| **Actual (prelación)** | Sin semáforo. Quien ya circula en el anillo tiene la vía; Carrera 15, Calle 40 / Paralela y Troncal inferior solo entran si el próximo vehículo del anillo llega después de la *brecha crítica*. Carrera 15 Sur y la salida Este (Troncal del Caribe) solo reciben vehículos. |
| **Semáforo virtual** | Verde, amarillo y todo-rojo en las tres entradas al anillo, una a la vez (Carrera 15 → Troncal inferior → Calle 40 / Paralela). Nunca hay dos verdes a la vez; el anillo cede frente a la entrada en verde mientras no esté congestionado. |
| **Alternativa (agentes)** | Agentes de tránsito dan paso alternado por bloques fijos de 25 s a cada entrada al anillo, en el mismo orden, deteniendo el anillo frente a la entrada que tiene el turno. |

Los modos se cambian **en caliente**, sin recargar la página. El perfil de demanda (**hora pico / hora valle**) se elige en el panel.

## Geometría modelada

| Acceso (id) | Rumbo | Calzadas | Isleta |
|---|---|---|---|
| Carrera 15 (NO) | 115° | una sola calzada de 2 carriles de **entrada** que baja desde el noroeste y se une al borde izquierdo del anillo casi en línea recta (eje corrido 11 m al oeste) | — |
| Carrera 15 Sur (S) | 245° | continuación de la Carrera 15: 2 carriles de **salida** (↓) en diagonal hacia el suroeste, a la izquierda del puente | — |
| Troncal del Caribe inferior (SE) | 300° | calzada de un sentido que sube desde abajo: 1 carril entra al anillo por el borde inferior (enlace triangular) y el **ramal** derecho sigue hacia la Troncal del Caribe (→), uniéndose a la salida Este en el borde derecho (segundo enlace triangular); pasa por debajo del puente | ramal + isleta |
| Troncal del Caribe, salida Este (E) | 340° | solo salida (2 carriles), abajo a la derecha del puente | — |
| Calle 40 / Paralela (NE) | 45° | 1 de entrada + 1 de salida; entra al cuadrante superior derecho, encima del puente | triangular |

- **Carrera 15 tangente:** la Carrera 15 (solo entrada) roza el borde izquierdo del anillo y se une a él casi en línea recta, sin isleta; la Carrera 15 Sur (solo salida) se desprende más adelante, de modo que la salida nunca queda antes de la unión. Entre las dos, un relleno de calzada (`uniones` en `geometria.json`) deja el borde exterior continuo. En cada acceso: `desplazamiento` (corre el eje), `anguloConexion` propio y `tMinimo` (aleja la línea de ceda para que las curvas empiecen fuera del anillo). Si la salida quedara antes de la unión, los movimientos se cruzarían y en hora pico el anillo se trabaría.
- **Anillo bajo el puente:** el anillo sigue completo por el costado derecho; se ve entre las dos calzadas elevadas y a ambos lados.
- **Enlaces triangulares de la Troncal inferior:** abajo, la isleta triangular entre el carril que entra al anillo y el ramal que sigue de largo; a la derecha, el ramal cede el paso al unirse a la salida Este del anillo.
- **Puente Ruta 90 (Troncal del Caribe), nivel superior:** dos calzadas elevadas **separadas** (2 carriles cada una: suroeste → noreste y noreste → suroeste) que suben inclinadas desde abajo a la izquierda (58°), hacen un **quiebre suave** encima del borde sureste de la glorieta y siguen hacia arriba a la derecha (28°), entre la Calle 40 y la salida Este (`puente.quiebre` en `geometria.json`). Se dibujan opacas, con barandas en ambos bordes, pilas entre las dos calzadas y sombra sobre las vías de abajo. Su tráfico (motos, carros y busetas; 1800 veh/h por sentido en pico y 900 en valle) va por encima y no se mezcla con la glorieta.
- **Entradas de un solo carril** (Calle 40): tienen un conector a cada carril del anillo y cada vehículo toma el que le sirve según su destino.
- **Ángulos:** los accesos no son ortogonales. Se separaron lo suficiente para que quien sale hacia un acceso no tenga que cruzar justo donde entran los del acceso anterior.
- **Otros elementos opcionales** en `geometria.json`: `ramal` de giro libre de un acceso a otro (como el de la versión anterior, Carrera 15 Sur → Calle 41a), `referencias` (p. ej. un puente peatonal), `isla.monumento`, `posEtiqueta` de un acceso (aquí se usa para que los rótulos no queden debajo del puente) y otras formas de puente: recto (`rumboEje`) o curvo entre dos accesos (`desde`/`hacia`/`radioCurva`).
- Rumbos en grados: 0 = este, 90 = norte, sentido antihorario. Todo se ajusta en `geometria.json` (radio de la isla, ancho de carril y de separadores, tipo de isleta, ángulos, puente y referencias).
- **Lado de la entrada:** con circulación por la derecha y anillo antihorario, en cada acceso la calzada de entrada queda del lado antihorario del separador.

## Cómo abrirlo

- **Sin internet:** doble clic en `index.html`. Los datos salen de `datos_respaldo.js` porque el navegador bloquea `fetch()` de archivos locales (CORS).
- **GitHub Pages:** *Settings → Pages → Deploy from branch → main / root*. Ahí la página lee los `.json` directamente.

No hay que instalar nada: es HTML, CSS y JavaScript puro, sin npm, sin frameworks y sin librerías externas.

## Estructura

```
index.html          Interfaz: lienzo, panel de control, métricas y comparador
styles.css          Estilos (claro/oscuro automático)
motor.js            Red de tramos (entradas, conectores, anillo, salidas, puente), puntos de conflicto y reloj
llegadas.js         Generador mulberry32 con semilla + llegadas Poisson por intervalo de 5 min, destino y ruta
control.js          Los 3 modos + quién cede en cada punto de conflicto (prelación, semáforo, agentes)
vehiculos.js        Movimiento (modelo IDM) sobre la ruta, distancia mínima, filtrado de motos
metricas.js         Capacidad de evacuación, cola máxima por entrada, espera promedio
dibujo.js           Renderizado en <canvas> (solo lee el estado del motor)
interfaz.js         Conecta botones y campos con el motor; bucle de animación
geometria.json      Medidas de la glorieta, accesos y puente
conteos.json        Aforo por intervalos de 5 min (perfiles pico y valle), destinos y tráfico del puente
parametros.json     Vehículos, motos, control, semilla, dt y métricas
datos_respaldo.js   Copia exacta de los tres .json como window.DATOS_RESPALDO (modo offline)
documentos/         Informes, fotos del aforo, actas del equipo
```

### Separación de responsabilidades

```
llegadas ─┐
control  ─┼─► motor.js ──► estado (solo números) ──► dibujo.js ──► <canvas>
vehiculos─┤                         ▲
metricas ─┘                         └── interfaz.js (botones, tablero, comparador)
```

El motor **no conoce el canvas ni el DOM**. Gracias a eso, el comparador corre los tres modos "sin pantalla" (`Motor.correrSinPantalla`) con la misma semilla y el mismo perfil, y muestra los resultados lado a lado.

## Modelo

- **Red de tramos:** cada vehículo recorre una ruta *entrada → conector → anillo → salida* (o *entrada → ramal → salida* si hay un ramal de giro libre) (polilíneas en metros) y su posición es la distancia `d` del frente sobre esa ruta.
- **Carril:** quien sale en la primera mitad de la vuelta usa el carril externo; quien va más lejos (o hace retorno) usa el interno.
- **Puntos de conflicto:** se calculan solos a partir de la geometría (fusiones al anillo, cruces de los carriles internos con el externo y divergencias de las salidas). Prioridad: salida > anillo > entrada; en semáforo/agentes la entrada con turno pasa por encima del anillo.
- **Reglas anti-traba** (con varias entradas, un anillo de dos carriles puede trabarse en círculo):
  - nadie entra a una zona ocupada, ni a una zona sin espacio para salir de ella;
  - quien ya circula en el anillo solo "guarda" los cruces de las salidas (no se detiene encima de ellos); ante una entrada sigue a su líder;
  - nadie entra a un carril del anillo lleno en más del 70 %, ni (en semáforo/agentes) a un anillo detenido justo después de su punto de entrada;
  - último recurso: un vehículo que lleva 30 s detenido dentro de la glorieta avanza unos metros sin esperar los cruces (como el conductor que "se cuela"; puede verse un roce momentáneo).
- **Llegadas:** proceso de Poisson con tasa constante en cada intervalo de 5 min del perfil (`conteos.json`). Misma semilla = mismas llegadas en los tres modos.
- **Movimiento:** *Intelligent Driver Model* (IDM) frente al obstáculo más cercano (vehículo adelante en su camino, línea de ceda o punto de conflicto), con límites de velocidad en conectores y anillo. Restricción dura: nunca se avanza más allá de la cola del líder menos 0.5 m.
- **Tipos:**
  - *Moto*: 2 m, acelera 3 m/s², se **filtra** (RF-04).
  - *Carro*: 4.5 m, 2 m/s², no se filtra.
  - *Buseta*: 8.5 m, 1.2 m/s², no se filtra.
- **Filtrado de motos (RF-04):** una moto detenida detrás de una fila de carros o busetas pasa al carril virtual entre los dos carriles de entrada y avanza hasta la línea de ceda; allí se mete al conector de su carril delante del carro parado (regla de *cremallera*: los carros que todavía no llegan a la línea la dejan pasar). Las motos que esperan fuera del tramo dibujado también entran directo al filtro. Solo se filtra si le conviene: si la fila de motos en el filtro es más larga que la de su carril, se queda en el carril. La Calle 40 (un solo carril de entrada) no tiene filtro.
- **Puente vehicular elevado:** red aparte (nivel elevado) con su propio generador aleatorio. Pasa por encima de la glorieta sin interactuar con ella y no cuenta en las métricas.

### Métricas

| Métrica | Definición |
|---|---|
| Capacidad de evacuación | Vehículos que salieron de la glorieta en el último minuto simulado |
| Cola máxima por entrada | Mayor cantidad simultánea de vehículos en estado `en_cola` en cada entrada (incluye los que esperan fuera del tramo dibujado) |
| Tiempo promedio de espera | Promedio de `t_cruce − t_entrada_cola` (cruce = pasar la línea de ceda; cuenta 0 si no se detuvo) |

Estados de un vehículo: `pendiente → aproximando → en_cola → cruzando → alejandose → salio`.

## Cómo cambiar los datos

1. Editar `geometria.json`, `conteos.json` o `parametros.json`. En `conteos.json` cada intervalo de 5 min trae el conteo de motos, carros y busetas por entrada (`NO` = Carrera 15, `SE` = Troncal inferior, `NE` = Calle 40; `S` = Carrera 15 Sur y `E` = Troncal del Caribe solo reciben salidas), y `destinos` dice qué fracción de cada entrada sale por cada acceso. Los verdes del semáforo están en `parametros.json → control.semaforo.verde<ID>` y el orden de los agentes en `control.alternativa.orden`.
2. Copiar el mismo contenido en `datos_respaldo.js` (si no, el modo offline usará los valores viejos).

> Los conteos incluidos son **datos calibrados base** en 3 bloques de 5 min por perfil (pico 150–160 vehículos por bloque: Carrera 15 ≈ 75, Calle 40 ≈ 45, Troncal inferior ≈ 40; ≈ 55 % motos, 35 % carros, 10 % busetas; valle ≈ 45 % del pico). Reemplácenlos con el aforo real del equipo.

## Próximos pasos sugeridos

- [ ] Medir en campo radios, anchos y ángulos reales de la glorieta y la posición del puente → `geometria.json`.
- [ ] Turnos de semáforo/agentes proporcionales a la demanda de cada acceso (hoy, en hora pico, la Carrera 15 acumula las colas más largas con semáforo y agentes).
- [ ] Aforo real por intervalos de 5 min y proporciones de destino → `conteos.json`.
- [ ] Calibrar velocidades, brecha crítica y aceleraciones con videos.
- [ ] Brecha crítica más corta para motos (aceptan huecos menores que los carros).
- [ ] Gráfica de la cola en el tiempo.

---

## Equipo Marea Vial

| Integrante | Rol | Responsabilidades | Contacto / GitHub |
|---|---|---|---|
| Carlos Jose Rosales Jimenez | Diseñador de instrucciones para la IA (Líder / integración) | Arquitectura, prompts IA, `motor.js`, `llegadas.js`, coordinación y revisión de PR | `carrojiso-developer` |
| Yoneiker Villalobos | Analista de campo y datos | Trabajo de campo, aforo, croquis, `geometria.json`, `conteos.json` y `datos_respaldo.js` | `Yoneiker-Spm` |
| Juan Dávila | Ingeniero de lógica y métricas | Reglas de tráfico, `vehiculos.js`, `control.js`, `metricas.js`, `parametros.json` y calibración | `JuanDavila25` |
| Alejandro Villarreal | Diseñador de interfaz y documentador | `index.html`, `styles.css`, `dibujo.js`, `interfaz.js` y los 3 PDF en `documentos/` | `Ale-vi` |

**Curso:** Introducción a la carrera · **Reto:** 3 · **Ciudad:** Santa Marta
