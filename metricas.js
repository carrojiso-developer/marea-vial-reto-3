/* =========================================================================
 * metricas.js — Paso 4 del motor: indicadores.
 *
 *  (Solo la glorieta y sus accesos: el tráfico de paso del Puente Ruta 90
 *  —nivel 2— no se cuenta.)
 *  - Capacidad de evacuación: vehículos que pasaron a estado 'salio' en el
 *    último minuto simulado (ventana deslizante de parametros.metricas).
 *  - Cola máxima por acceso: mayor cantidad simultánea de vehículos en
 *    estado 'en_cola' en cada acceso (incluye los que esperan fuera del
 *    tramo dibujado porque la cola ya llegó al borde).
 *  - Tiempo promedio de espera: promedio de (t_cruce − t_entrada_cola) de
 *    los vehículos que ya cruzaron. Un vehículo que cruzó sin detenerse
 *    cuenta con espera 0.
 *
 * No conoce el canvas ni el DOM.
 * ========================================================================= */
'use strict';

const Metricas = {
  crear(geo, param) {
    const porAcceso = (valor) => Object.fromEntries(geo.entradas.map((id) => [id, valor]));
    return {
      ventana: param.metricas.ventanaCapacidad,
      tiemposSalida: [],
      capacidad: 0,             // veh en el último minuto
      totalSalidos: 0,
      totalCruzados: 0,
      sumaEspera: 0,
      esperaPromedio: 0,        // s
      colaActual: porAcceso(0),
      colaMax: porAcceso(0),
      cruzadosPorAcceso: porAcceso(0),
      esperaPorAcceso: porAcceso(0), // suma; el promedio se calcula al leer
    };
  },

  paso(estado) {
    const m = estado.metricas;
    const t = estado.t;

    for (const veh of estado.crucesPaso) {
      const espera = veh.t_entrada_cola === null ? 0 : veh.t_cruce - veh.t_entrada_cola;
      m.totalCruzados++;
      m.sumaEspera += espera;
      m.cruzadosPorAcceso[veh.acceso]++;
      m.esperaPorAcceso[veh.acceso] += espera;
    }
    m.esperaPromedio = m.totalCruzados ? m.sumaEspera / m.totalCruzados : 0;

    for (const veh of estado.salidasPaso) {
      m.tiemposSalida.push(veh.t_salida);
      m.totalSalidos++;
    }
    while (m.tiemposSalida.length && m.tiemposSalida[0] <= t - m.ventana) m.tiemposSalida.shift();
    m.capacidad = m.tiemposSalida.length;

    for (const id of Object.keys(m.colaActual)) m.colaActual[id] = 0;
    for (const veh of estado.vehiculos) if (!veh.puente && !veh.paso && veh.estado === 'en_cola') m.colaActual[veh.acceso]++;
    for (const id of Object.keys(estado.pendientes)) {
      for (const veh of estado.pendientes[id]) if (veh.estado === 'en_cola') m.colaActual[id]++;
    }
    for (const id of Object.keys(m.colaActual)) {
      if (m.colaActual[id] > m.colaMax[id]) m.colaMax[id] = m.colaActual[id];
    }
  },

  /** Resumen plano, útil para la tabla comparadora. */
  resumen(estado) {
    const m = estado.metricas;
    const minutos = estado.t / 60;
    const esperaAcceso = {};
    for (const id of Object.keys(m.cruzadosPorAcceso)) {
      esperaAcceso[id] = m.cruzadosPorAcceso[id] ? m.esperaPorAcceso[id] / m.cruzadosPorAcceso[id] : 0;
    }
    let enRedOPendientes = estado.vehiculos.filter((v) => !v.puente && !v.paso).length;
    for (const id of Object.keys(estado.pendientes)) enRedOPendientes += estado.pendientes[id].length;
    return {
      minutos,
      capacidadUltimoMinuto: m.capacidad,
      salidasPorMinuto: minutos > 0 ? m.totalSalidos / minutos : 0,
      esperaPromedio: m.esperaPromedio,
      esperaPorAcceso: esperaAcceso,
      colaMax: Object.assign({}, m.colaMax),
      totalSalidos: m.totalSalidos,
      sinEvacuar: enRedOPendientes,
    };
  },
};
