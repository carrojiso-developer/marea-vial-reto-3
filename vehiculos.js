/* =========================================================================
 * vehiculos.js — Paso 3 del motor: movimiento.
 *
 * Cada vehículo avanza sobre una trayectoria recta de su acceso (posición
 * `s` del frente, en metros). La aceleración sigue el modelo IDM
 * (Intelligent Driver Model): acelera hacia su velocidad deseada y frena
 * según la distancia y la velocidad relativa con el de adelante.
 *
 * Además del IDM hay una restricción dura: nunca se avanza más allá de
 * (cola del líder − 0.5 m) ni se pasa la línea de pare sin autorización,
 * así que los vehículos jamás se superponen.
 *
 * Comportamiento por tipo (ver parametros.json):
 *   - moto   : corta, acelera rápido y puede FILTRARSE por el costado de una
 *              fila de carros/busetas detenidos (carril virtual 'filtro').
 *   - carro  : comportamiento estándar, no filtra.
 *   - buseta : larga, acelera lento, no filtra.
 *
 * No conoce el canvas ni el DOM.
 * ========================================================================= */
'use strict';

const Vehiculos = {
  HUECO_FISICO: 0.5, // separación mínima absoluta entre parachoques (m)

  /** Aceleración IDM. gap = distancia libre al obstáculo, vLider = su velocidad. */
  idm(veh, tp, vDeseada, gap, vLider) {
    const a = tp.acelMax;
    const b = tp.decelComoda;
    let acc = a * (1 - Math.pow(veh.v / vDeseada, 4));
    if (gap !== Infinity) {
      const dv = veh.v - vLider;
      const sEstrella = tp.distMinima + Math.max(0, veh.v * tp.tiempoSeguimiento + (veh.v * dv) / (2 * Math.sqrt(a * b)));
      const g = Math.max(gap, 0.01);
      acc -= a * (sEstrella / g) * (sEstrella / g);
    }
    return Math.max(acc, -tp.decelMax);
  },

  /** ¿Puede la moto pasar al carril de filtrado sin tocar a otra moto que ya filtra? */
  _hayEspacioFiltro(lista, moto, brecha) {
    for (const o of lista) {
      if (o === moto || o.carril !== 'filtro') continue;
      const oTrasera = o.s - o.largo;
      const mTrasera = moto.s - moto.largo;
      const separados = oTrasera >= moto.s + brecha || o.s <= mTrasera - brecha;
      if (!separados) return false;
    }
    return true;
  },

  _decidirFiltrado(estado, lista) {
    const P = estado.param;
    if (!P.motos.filtrado) return;
    const geo = estado.geo;
    const umbral = P.metricas.umbralVelocidadCola;
    for (let i = 0; i < lista.length; i++) {
      const veh = lista[i];
      if (veh.tipo !== 'moto' || veh.carril !== 'principal' || veh.s > geo.sParada - 1) continue;
      // Líder en el carril principal.
      let lider = null;
      for (let j = i - 1; j >= 0; j--) {
        if (lista[j].carril === 'principal') { lider = lista[j]; break; }
      }
      if (!lider || lider.tipo === 'moto' || lider.v >= umbral) continue;
      const hueco = lider.s - lider.largo - veh.s;
      if (hueco > 12) continue; // todavía lejos de la fila
      if (this._hayEspacioFiltro(lista, veh, P.motos.brechaFiltrado)) veh.carril = 'filtro';
    }
  },

  paso(estado, dt) {
    const geo = estado.geo;
    const P = estado.param;
    const umbralCola = P.metricas.umbralVelocidadCola;
    const quedan = [];

    for (const id of Object.keys(geo.accesos)) {
      // De adelante hacia atrás.
      const lista = estado.vehiculos
        .filter((v) => v.acceso === id)
        .sort((a, b) => b.s - a.s || a.id - b.id);

      this._decidirFiltrado(estado, lista);

      // Pasada A: aceleraciones con el estado del instante anterior.
      const ultimo = { principal: null, filtro: null };
      const lideres = new Map();
      for (const veh of lista) {
        const tp = P.vehiculos[veh.tipo];
        const lider = ultimo[veh.carril];
        lideres.set(veh, lider);
        ultimo[veh.carril] = veh;

        let gap = Infinity;
        let vLider = 0;
        if (lider) {
          gap = lider.s - lider.largo - veh.s;
          vLider = lider.v;
        }
        if (!veh.autorizado && veh.s <= geo.sParada + 1e-6) {
          // La línea de pare es un obstáculo detenido; se suma distMinima para quedar pegado a la línea.
          const gapLinea = geo.sParada - veh.s + tp.distMinima - 0.3;
          if (gapLinea < gap) { gap = gapLinea; vLider = 0; }
        }
        let vDeseada = tp.velDeseada;
        if (veh.carril === 'filtro' && veh.s < geo.sParada) vDeseada = Math.min(vDeseada, P.motos.velMaxFiltrado);
        veh.a = this.idm(veh, tp, vDeseada, gap, vLider);
      }

      // Pasada B: integrar de adelante hacia atrás aplicando restricciones duras.
      for (const veh of lista) {
        const lider = lideres.get(veh);
        let vNueva = Math.max(0, veh.v + veh.a * dt);
        let sNueva = veh.s + Math.max(0, ((veh.v + vNueva) / 2) * dt);

        if (lider) {
          const maxS = lider.s - lider.largo - this.HUECO_FISICO;
          if (sNueva > maxS) {
            sNueva = Math.max(veh.s, maxS);
            vNueva = Math.min(vNueva, lider.v);
          }
        }
        if (!veh.autorizado && veh.s <= geo.sParada + 1e-6 && sNueva > geo.sParada) {
          sNueva = geo.sParada;
          vNueva = 0;
        }
        veh.s = sNueva;
        veh.v = vNueva;

        // Transiciones de estado.
        if (veh.t_cruce === null) {
          if (veh.s > geo.sParada) {
            veh.t_cruce = estado.t;
            veh.estado = 'cruzando';
            estado.crucesPaso.push(veh);
          } else if (veh.estado === 'aproximando' && veh.v < umbralCola) {
            veh.estado = 'en_cola';
            veh.t_entrada_cola = estado.t;
          }
        }
        if (veh.t_cruce !== null && !veh.fueraCaja && veh.s - veh.largo > geo.sFinCaja) {
          veh.fueraCaja = true;
          veh.estado = 'alejandose';
        }
      }

      for (const veh of lista) {
        if (veh.s - veh.largo > geo.longitudTotal) {
          veh.estado = 'salio';
          veh.t_salida = estado.t;
          veh.enRed = false;
          estado.salidasPaso.push(veh);
        } else {
          quedan.push(veh);
        }
      }
    }
    estado.vehiculos = quedan;
  },
};
