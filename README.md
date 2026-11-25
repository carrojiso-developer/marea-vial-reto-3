# Marea Vial · Reto 3 — Simulador 2D de un cruce en Santa Marta

Simulador web en 2D de tráfico vehicular que modela un cruce de Santa Marta y compara tres formas de operarlo:

| Modo | Qué representa |
|---|---|
| **Actual** | Sin semáforo. La vía principal (E–O) tiene prelación; la secundaria (N–S) entra por oportunidad, solo cuando la brecha supera la *brecha crítica*. |
| **Semáforo virtual** | Dos fases (E–O / N–S) con amarillo y todo-rojo. Nunca hay verdes en conflicto. |
| **Alternativa** | Un agente de tránsito da turnos fijos a cada acceso (N → E → S → O) con despeje entre turnos. |

Los modos se cambian **en caliente**, sin recargar la página.

## Cómo abrirlo

- **Sin internet:** doble clic en `index.html`. Los datos salen de `datos_respaldo.js` porque el navegador bloquea `fetch()` de archivos locales (CORS).
- **GitHub Pages:** *Settings → Pages → Deploy from branch → main / root*. Ahí la página lee los `.json` directamente.

No hay que instalar nada: es HTML, CSS y JavaScript puro, sin npm, sin frameworks y sin librerías externas.

## Estructura

```
index.html          Interfaz: lienzo, panel de control, métricas y comparador
styles.css          Estilos (claro/oscuro automático)
motor.js            Reloj: pasos fijos de 0.1 s → llegadas → control → movimiento → métricas
llegadas.js         Generador mulberry32 con semilla fija + llegadas Poisson por acceso y tipo
control.js          Los 3 modos de operación (quién puede entrar a la intersección)
vehiculos.js        Movimiento (modelo IDM), distancia mínima, filtrado de motos
metricas.js         Capacidad de evacuación, cola máxima por acceso, espera promedio
dibujo.js           Renderizado en <canvas> (solo lee el estado del motor)
interfaz.js         Conecta botones y campos con el motor; bucle de animación
geometria.json      Medidas del cruce (carriles, bermas, pasos peatonales, accesos)
conteos.json        Tasas de llegada (veh/h) por acceso y tipo de vehículo
parametros.json     Vehículos, control, semilla, dt y métricas
datos_respaldo.js   Copia de los tres .json como window.DATOS_RESPALDO (modo offline)
documentos/         Informes, fotos del aforo, actas del equipo
```

### Separación de responsabilidades

```
llegadas ─┐
control  ─┼─► motor.js ──► estado (solo números) ──► dibujo.js ──► <canvas>
vehiculos─┤                         ▲
metricas ─┘                         └── interfaz.js (botones, tablero, comparador)
```

El motor **no conoce el canvas ni el DOM**. Gracias a eso, el comparador corre los tres modos "sin pantalla" (`Motor.correrSinPantalla`) con la misma semilla y muestra los resultados lado a lado.

## Modelo

- **Llegadas:** tiempos entre llegadas exponenciales (proceso de Poisson) con la tasa de `conteos.json`. Misma semilla = mismas llegadas en los tres modos.
- **Movimiento:** cada vehículo sigue el *Intelligent Driver Model* (IDM) con parámetros por tipo. Además hay una restricción dura: nadie avanza más allá de la cola de su líder menos 0.5 m ni cruza la línea de pare sin autorización, así que **los vehículos nunca se superponen**.
- **Tipos:**
  - *Moto*: 2 m, acelera 3 m/s², se **filtra** por el costado de filas de carros o busetas detenidos.
  - *Carro*: 4.5 m, 2 m/s², no se filtra.
  - *Buseta*: 8.5 m, 1.2 m/s², no se filtra.
- **Seguridad en la caja:** en los tres modos, un vehículo solo entra si no hay vehículos autorizados del eje perpendicular dentro de la caja o camino a ella.
- **Versión actual:** todos los movimientos son de frente (sin giros).

### Métricas

| Métrica | Definición |
|---|---|
| Capacidad de evacuación | Vehículos que pasaron a estado `salio` en el último minuto simulado |
| Cola máxima por acceso | Mayor cantidad simultánea de vehículos en estado `en_cola` en el acceso (incluye los que esperan fuera del tramo dibujado) |
| Tiempo promedio de espera | Promedio de `t_cruce − t_entrada_cola` de los vehículos que ya cruzaron (cuenta 0 si cruzó sin detenerse) |

Estados de un vehículo: `pendiente → aproximando → en_cola → cruzando → alejandose → salio`.

## Cómo cambiar los datos

1. Editar `geometria.json`, `conteos.json` o `parametros.json`.
2. Copiar el mismo contenido en `datos_respaldo.js` (si no, el modo offline usará los valores viejos).

> Los valores incluidos son **de ejemplo**. Reemplácenlos con las medidas y el aforo reales del cruce que escoja el equipo.

## Próximos pasos sugeridos

- [ ] Elegir el cruce o glorieta real y medir la geometría.
- [ ] Aforo por acceso y tipo de vehículo (hora pico) → `conteos.json`.
- [ ] Giros a la izquierda y a la derecha (proporciones en `conteos.json`).
- [ ] Calibrar velocidades y aceleraciones con videos del cruce.
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
