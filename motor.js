/* =========================================================================
 * motor.js — Reloj de la simulación.
 *
 * Avanza en pasos fijos de dt = 0.1 s y en cada paso ejecuta, en este
 * orden estricto:
 *     1) llegadas   (llegadas.js)
 *     2) control    (control.js)
 *     3) movimiento (vehiculos.js)
 *     4) métricas   (metricas.js)
 *
 * El motor solo produce un objeto `estado` con números. No sabe que existe
 * el canvas ni el DOM: dibujo.js lee el estado para pintar e interfaz.js
 * lo maneja desde los controles. Por eso se puede correr "sin pantalla"
 * (ver Motor.correrSinPantalla, usado por la tabla comparadora).
 * ========================================================================= */
'use strict';

const Motor = {
  /** Copia profunda simple (los datos son JSON puro). */
  clonar(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /** Calcula medidas derivadas de geometria.json que usan todos los módulos. */
  derivarGeometria(g) {
    const L = g.longitudAcceso;
    const semiVia = g.anchoCarril + g.berma; // media calzada (un sentido)
    const geo = {
      fuente: g,
      L,
      semiVia,
      anchoCarril: g.anchoCarril,
      berma: g.berma,
      anchoPasoPeatonal: g.anchoPasoPeatonal,
      anchoAnden: g.anchoAnden,
      desplazamientoFiltro: g.desplazamientoFiltro,
      sParada: L - semiVia - g.anchoPasoPeatonal - 0.5, // línea de pare
      sFinCaja: L + semiVia + g.anchoPasoPeatonal,      // fin del área de conflicto
      longitudTotal: 2 * L,
      accesos: {},
    };
    for (const a of g.accesos) {
      const [dx, dy] = a.direccion;
      geo.accesos[a.id] = {
        id: a.id,
        nombre: a.nombre,
        via: a.via,
        eje: a.eje,
        dir: [dx, dy],
        derecha: [-dy, dx],     // normal hacia la derecha (y crece hacia abajo, se circula por la derecha)
        origen: [-dx * L, -dy * L],
      };
    }
    return geo;
  },

  /** Posición en el mundo (m) del centro de un vehículo y su ángulo. */
  posicionMundo(geo, veh) {
    const acc = geo.accesos[veh.acceso];
    const centro = veh.s - veh.largo / 2;
    const lateral = geo.anchoCarril / 2 + (veh.carril === 'filtro' ? geo.desplazamientoFiltro : 0);
    return {
      x: acc.origen[0] + acc.dir[0] * centro + acc.derecha[0] * lateral,
      y: acc.origen[1] + acc.dir[1] * centro + acc.derecha[1] * lateral,
      angulo: Math.atan2(acc.dir[1], acc.dir[0]),
    };
  },

  /**
   * Crea un estado nuevo.
   * datos = { geometria, conteos, parametros }; opciones = { semilla, modo }
   */
  crear(datos, opciones = {}) {
    const param = this.clonar(datos.parametros);
    const conteos = this.clonar(datos.conteos);
    const geo = this.derivarGeometria(datos.geometria);
    const semilla = opciones.semilla ?? param.simulacion.semilla;

    const estado = {
      t: 0,
      paso: 0,
      dt: param.simulacion.dt,
      semilla,
      geo,
      param,
      conteos,
      vehiculos: [],
      pendientes: Object.fromEntries(Object.keys(geo.accesos).map((id) => [id, []])),
      siguienteId: 1,
      crucesPaso: [],
      salidasPaso: [],
    };
    estado.llegadas = Llegadas.crear(conteos, semilla);
    estado.control = Control.crear(param);
    estado.metricas = Metricas.crear(geo, param);
    if (opciones.modo) Control.cambiarModo(estado, opciones.modo);
    return estado;
  },

  /** Un paso fijo de dt segundos. */
  paso(estado) {
    estado.paso++;
    estado.t = estado.paso * estado.dt; // sin acumular error de coma flotante
    estado.crucesPaso = [];
    estado.salidasPaso = [];

    Llegadas.paso(estado, estado.dt);   // 1) llegadas
    Control.paso(estado, estado.dt);    // 2) control
    Vehiculos.paso(estado, estado.dt);  // 3) movimiento
    Metricas.paso(estado);              // 4) métricas
  },

  /** Avanza `segundos` de tiempo simulado. */
  avanzar(estado, segundos) {
    const n = Math.round(segundos / estado.dt);
    for (let i = 0; i < n; i++) this.paso(estado);
  },

  cambiarModo(estado, modo) {
    Control.cambiarModo(estado, modo);
  },

  /** Corre una simulación completa sin dibujar y devuelve el resumen de métricas. */
  correrSinPantalla(datos, modo, semilla, minutos) {
    const estado = this.crear(datos, { semilla, modo });
    this.avanzar(estado, minutos * 60);
    return Metricas.resumen(estado);
  },
};
