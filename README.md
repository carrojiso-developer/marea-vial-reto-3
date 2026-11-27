# Marea Vial · Reto 3 — Simulador 2D de la Glorieta de La Lucha (Santa Marta)

Simulador web en 2D de tráfico que modela la **Glorieta de La Lucha** (11.218753, -74.190173) en vista aérea de **dos niveles**, con el norte arriba. Lienzo **3:2** (150 m × 100 m); toda la geometría de `geometria.json` está en **% del lienzo** (`(0, 0)` arriba a la izquierda, `(100, 100)` abajo a la derecha). Compara tres formas de operar la glorieta:

| Modo | Qué representa |
|---|---|
| **Actual (prelación)** | Sin semáforo. Quien ya circula en el anillo tiene la vía; Carrera 15, Corredor inferior, Corredor Este y Calle 40 / Paralela solo entran si el próximo vehículo del anillo llega después de la *brecha crítica*. Carrera 15 Sur y el Ramal inferior solo reciben vehículos. |
| **Semáforo virtual** | Verde, amarillo y todo-rojo en las cuatro entradas al anillo, una a la vez (Carrera 15 → Corredor inferior → Corredor Este → Calle 40 / Paralela). Nunca hay dos verdes a la vez; el anillo cede frente a la entrada en verde mientras no esté congestionado. |
| **Alternativa (agentes)** | Agentes de tránsito que dan paso por demanda: en cada cambio de turno eligen la entrada con más vehículos esperando (ignoran las vacías) y mantienen el turno hasta que su cola baja a 2 vehículos o se cumple el tope de 40 s, deteniendo el anillo frente a la entrada que tiene el turno. |

Los modos se cambian **en caliente**, sin recargar la página. El perfil de demanda (**hora pico / hora valle**) se elige en el panel.

## Geometría modelada

**Nivel 1 (suelo).** Rotonda con centro en (45 %, 50 %) y radio de 25 % del lado menor del lienzo (25 m; escala uniforme, así es un **círculo perfecto**: y = 25 %–75 %, x ≈ 28.3 %–61.7 %) (anillo de **2 carriles, sentido antihorario**: ← arriba, ↓ izquierda, → abajo, ↑ derecha) alrededor de la isla verde. Posiciones en el anillo como reloj: 12:00 arriba, 3:00 derecha.

| Acceso (id) | Trazado (en % del lienzo) | Sentidos |
|---|---|---|
| Carrera 15 (NO) | embudo entre el borde oeste (30, 0) → (28.3, 48), tangente a las 9:00, y el borde este (37, 0) → (49.3, 25.9), tangente a las 12:30 | calzada oeste: 2 carriles que **entran** (↓, con filtrado de motos); calzada este: 1 carril que **sale** (↑) |
| Carrera 15 Sur (S) | continuación sin quiebre del borde oeste: (28.3, 50) → (10, 100), bajo el costado oeste de la calzada superior del puente | solo **salida** (↙) |
| Calle 40 / Paralela (NE) | bordes paralelos (55.2, 30.2) → (99, 0) y (58.9, 36.2) → (100, 7), que arrancan sobre el perímetro, encima del puente | carril superior **entra** (↙); inferior **sale** (↗) |
| Corredor Este (E) | ramal medio-derecho (100, 43) → 3:00 (61.6, 47); salida por la línea continua desde las 5:00 hasta (100, 48) | **entra** (←) y **sale** (→) |
| Corredor inferior (SE) | línea continua desde (33, 100), tangente al anillo entre 5:45 y 5:00 | un carril que **entra** (↗); en la línea de ceda se divide: unos entran al anillo y otros siguen de largo (giro libre) hacia el Este, cediendo al unirse a la salida Este |
| Ramal inferior (SI) | 6:30 (40.7, 74.2) → (28, 100), justo bajo la calzada inferior del puente | solo **salida** (↓) |

- **Isletas triangulares:** la pequeña (bajo el puente) entre el Ramal inferior, el Corredor inferior y el arco sur; la grande, verde y con árboles, entre la entrada Este, la salida Este y el arco 3:00–5:00.
- **Nivel 2: Puente Ruta 90.** Dos calzadas separadas de 2 carriles, asfalto opaco, barandas y sombra. Cruzan **por encima del cuadrante sureste del anillo y de la isla**: calzada superior (100, 13) → (60.0, 39.2) → (47.3, 52.2) → (33.2, 67.7) → (15, 100), sentido **noreste → suroeste (↙)**; calzada inferior (22, 100) → (40.7, 74.2) → (55.3, 55) → (61.6, 47.5) → (100, 23), sentido **suroeste → noreste (↗)**. Su tráfico (1800 veh/h por sentido en pico, 900 en valle) nunca cede, frena ni choca con el nivel 1 y no cuenta en las métricas.
- **Orden de dibujo:** suelo → vehículos del nivel 1 → sombra y tableros del puente (tapan a los de abajo en los cruces de 7:30, 6:30, 2:30 y 3:00) → vehículos del puente. Señales de ceda, semáforos y agentes se pintan encima como indicadores, porque las entradas Este y Corredor inferior quedan bajo el puente.
- **Cómo se describe en `geometria.json`:** `curvas` (bordes y trazos con piezas `linea`, `bezier`, `spline`, `arcoAnillo`, `haciaAnillo`, `desdeAnillo`), `superficies` (polígonos de calzada a partir de los bordes) y, por acceso, `entradas` / `salida` / `ramal` como carriles paralelos a una curva (`desplazamiento` en m, `invertir`). La línea de ceda y el inicio de cada salida se calculan solos (`distanciaCeda`, `distanciaSalida`); los conectores al anillo usan `anguloEntrada` / `anguloSalida` (grados de anillo, general o por acceso).
- **Circulación por la derecha:** en toda vía de doble sentido cada vehículo va por el carril a su derecha.

## Cómo abrirlo

- **Sin internet:** doble clic en `index.html`. Los datos salen de `datos_respaldo.js` porque el navegador bloquea `fetch()` de archivos locales (CORS).
- **GitHub Pages:** *Settings → Pages → Deploy from branch → main / root*. Ahí la página lee los `.json` directamente.

No hay que instalar nada: es HTML, CSS y JavaScript puro, sin npm, sin frameworks y sin librerías externas.

## Estructura

```
index.html          Interfaz: lienzo, panel de control, métricas y comparador
styles.css          Estilos (claro/oscuro automático)
motor.js            Geometría en % → red de tramos en m (entradas, conectores, anillo, salidas, ramal, puente), conflictos y reloj
llegadas.js         Generador mulberry32 con semilla + llegadas Poisson por intervalo de 5 min, destino y ruta
control.js          Los 3 modos + quién cede en cada punto de conflicto (prelación, semáforo, agentes)
vehiculos.js        Movimiento (modelo IDM) sobre la ruta, distancia mínima, filtrado de motos
metricas.js         Capacidad de evacuación, cola máxima por entrada, espera promedio
dibujo.js           Renderizado en <canvas> (solo lee el estado del motor)
interfaz.js         Conecta botones y campos con el motor; bucle de animación
geometria.json      Trazado en % del lienzo: anillo, bordes, accesos, isletas y puente
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

- **Red de tramos:** cada vehículo recorre una ruta *entrada → conector → anillo → salida → cola de la salida* (o *entrada → ramal → cola de la salida* en el giro libre del Corredor inferior) (polilíneas en metros) y su posición es la distancia `d` del frente sobre esa ruta.
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
- **Filtrado de motos (RF-04):** una moto detenida detrás de una fila de carros o busetas pasa al carril virtual entre los dos carriles de entrada y avanza hasta la línea de ceda; allí se mete al conector de su carril delante del carro parado (regla de *cremallera*: los carros que todavía no llegan a la línea la dejan pasar). Las motos que esperan fuera del tramo dibujado también entran directo al filtro. Solo se filtra si le conviene: si la fila de motos en el filtro es más larga que la de su carril, se queda en el carril. Solo la Carrera 15 tiene dos carriles de entrada; las demás entradas (un carril) no tienen filtro.
- **Puente Ruta 90 (nivel 2):** red aparte con su propio generador aleatorio. Pasa por encima de la glorieta sin interactuar con ella (los vehículos solo ven a los de su mismo nivel) y no cuenta en las métricas.

### Métricas

| Métrica | Definición |
|---|---|
| Capacidad de evacuación | Vehículos que salieron de la glorieta en el último minuto simulado |
| Cola máxima por entrada | Mayor cantidad simultánea de vehículos en estado `en_cola` en cada entrada (incluye los que esperan fuera del tramo dibujado) |
| Tiempo promedio de espera | Promedio de `t_cruce − t_entrada_cola` (cruce = pasar la línea de ceda; cuenta 0 si no se detuvo) |

Estados de un vehículo: `pendiente → aproximando → en_cola → cruzando → alejandose → salio`.

## Cómo cambiar los datos

1. Editar `geometria.json`, `conteos.json` o `parametros.json`. En `conteos.json` cada intervalo de 5 min trae el conteo de motos, carros y busetas por entrada (`NO` = Carrera 15, `SE` = Corredor inferior, `E` = Corredor Este, `NE` = Calle 40; `S` = Carrera 15 Sur y `SI` = Ramal inferior solo reciben salidas), y `destinos` dice qué fracción de cada entrada sale por cada acceso. Los verdes del semáforo están en `parametros.json → control.semaforo.verde<ID>` y los agentes por demanda en `control.alternativa` (`turnoMaximo`, `colaVaciado`, `turnoMinimo`; `orden` solo desempata).
2. Copiar el mismo contenido en `datos_respaldo.js` (si no, el modo offline usará los valores viejos).

> Los conteos incluidos son **datos calibrados base** en 3 bloques de 5 min por perfil (pico 150–160 vehículos por bloque: Carrera 15 ≈ 75, Calle 40 ≈ 40, Corredor inferior ≈ 40, Corredor Este ≈ 23; ≈ 55 % motos, 35 % carros, 10 % busetas; valle ≈ 45 % del pico). Reemplácenlos con el aforo real del equipo.

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
