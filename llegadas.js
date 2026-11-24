/* =========================================================================
 * llegadas.js — Paso 1 del motor: llegadas de vehículos.
 *
 * - Generador pseudoaleatorio con semilla fija (mulberry32): misma semilla,
 *   misma secuencia de llegadas, para poder comparar modos con justicia.
 * - Llegadas tipo Poisson: el tiempo entre llegadas es exponencial con la
 *   tasa (veh/h) de conteos.json, por acceso y por tipo de vehículo.
 * - Los vehículos que llegan esperan en "pendientes" hasta que haya espacio
 *   al inicio del acceso (si la cola llega hasta el borde, se acumulan ahí).
 *
 * No conoce el canvas ni el DOM.
 * ========================================================================= */
'use strict';

function mulberry32(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const Llegadas = {
  /** Tiempo hasta la próxima llegada (s) para una tasa en veh/s. */
  _exponencial(rng, tasaPorSegundo) {
    return -Math.log(1 - rng()) / tasaPorSegundo;
  },

  crear(conteos, semilla) {
    const rng = mulberry32(semilla);
    const fuentes = [];
    // El orden de las claves del JSON es estable, así que el resultado es determinista.
    for (const acceso of Object.keys(conteos.tasas)) {
      for (const tipo of Object.keys(conteos.tasas[acceso])) {
        const tasa = conteos.tasas[acceso][tipo] / 3600;
        if (tasa > 0) {
          fuentes.push({ acceso, tipo, tasa, proxima: this._exponencial(rng, tasa) });
        }
      }
    }
    return { rng, fuentes };
  },

  /** Crea un vehículo nuevo (todavía fuera de la red). */
  _nuevoVehiculo(estado, acceso, tipo, tLlegada) {
    const tp = estado.param.vehiculos[tipo];
    return {
      id: estado.siguienteId++,
      tipo,
      acceso,
      eje: estado.geo.accesos[acceso].eje,
      carril: 'principal',   // 'principal' | 'filtro' (solo motos)
      s: 0,                  // posición del frente sobre la trayectoria (m)
      v: 0,                  // velocidad (m/s)
      a: 0,                  // aceleración (m/s²)
      largo: tp.largo,
      ancho: tp.ancho,
      estado: 'pendiente',   // pendiente → aproximando → en_cola → cruzando → alejandose → salio
      enRed: false,
      autorizado: false,     // lo decide control.js
      fueraCaja: false,
      t_llegada: tLlegada,
      t_entrada_cola: null,
      t_cruce: null,
      t_salida: null,
    };
  },

  paso(estado, dt) {
    const gen = estado.llegadas;

    // 1a) Generar llegadas cuyo instante ya ocurrió.
    for (const f of gen.fuentes) {
      while (f.proxima <= estado.t) {
        estado.pendientes[f.acceso].push(this._nuevoVehiculo(estado, f.acceso, f.tipo, f.proxima));
        f.proxima += this._exponencial(gen.rng, f.tasa);
      }
    }

    // 1b) Insertar pendientes en la red si hay espacio al inicio del acceso.
    for (const id of Object.keys(estado.pendientes)) {
      const cola = estado.pendientes[id];
      while (cola.length > 0) {
        const veh = cola[0];
        const tp = estado.param.vehiculos[veh.tipo];
        const ultimo = this._ultimoEnCarril(estado.vehiculos, id, 'principal');
        let vIngreso = tp.velDeseada * 0.8;
        if (ultimo) {
          const hueco = ultimo.s - ultimo.largo; // el nuevo entra con su frente en s = 0
          vIngreso = Math.min(vIngreso, ultimo.v);
          if (hueco < tp.distMinima + vIngreso * tp.tiempoSeguimiento * 0.6) break;
        }
        cola.shift();
        veh.v = vIngreso;
        veh.enRed = true;
        if (veh.estado === 'pendiente') veh.estado = 'aproximando';
        estado.vehiculos.push(veh);
      }
      // Los que siguen afuera ya están haciendo cola (aunque no se vean).
      for (const veh of cola) {
        if (veh.estado === 'pendiente') {
          veh.estado = 'en_cola';
          veh.t_entrada_cola = veh.t_llegada;
        }
      }
    }
  },

  _ultimoEnCarril(vehiculos, acceso, carril) {
    let ultimo = null;
    for (const v of vehiculos) {
      if (v.acceso === acceso && v.carril === carril && (!ultimo || v.s < ultimo.s)) ultimo = v;
    }
    return ultimo;
  },
};
