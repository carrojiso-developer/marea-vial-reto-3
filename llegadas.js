/* =========================================================================
 * llegadas.js — Paso 1 del motor: llegadas de vehículos.
 *
 * - Generador pseudoaleatorio con semilla fija (mulberry32): misma semilla,
 *   misma secuencia de llegadas, para poder comparar modos con justicia.
 * - Llegadas tipo Poisson por acceso y tipo, con tasa CONSTANTE POR TRAMOS:
 *   cada intervalo de 5 min del perfil (pico o valle) de conteos.json tiene
 *   su propio conteo. Al terminar la hora el perfil vuelve a empezar.
 * - A cada vehículo se le sortea el destino (conteos.destinos) y con eso su
 *   ruta y su carril (externo para las primeras salidas, interno para el resto).
 * - Los que no caben al inicio del acceso esperan en "pendientes".
 * - El tráfico del Puente Ruta 90 (nivel 2, dos calzadas de un solo sentido) usa
 *   OTRO generador para no alterar las llegadas de la glorieta, y no cuenta en
 *   las métricas.
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
  _exponencial(rng, tasaPorSegundo) {
    return -Math.log(1 - rng()) / tasaPorSegundo;
  },

  /** Próxima llegada después de `desde` con tasas constantes por intervalo (proceso sin memoria). */
  _siguiente(rng, f, desde) {
    if (f.tasas.every((x) => x <= 0)) return Infinity;
    let t = desde;
    for (let guardia = 0; guardia < 10000; guardia++) {
      const k = Math.floor(t / f.intervalo + 1e-9);
      const fin = (k + 1) * f.intervalo;
      const tasa = f.tasas[k % f.tasas.length];
      if (tasa > 0) {
        const cand = t + this._exponencial(rng, tasa);
        if (cand < fin) return cand;
      }
      t = fin;
    }
    return Infinity;
  },

  crear(estado, semilla) {
    const conteos = estado.conteos;
    const perfil = conteos.perfiles[estado.perfil];
    const intervalo = conteos.intervaloMin * 60;
    const rng = mulberry32(semilla);
    const fuentes = [];
    // Orden estable: accesos de entrada de la geometría × tipos del primer intervalo.
    const tipos = Object.keys(estado.param.vehiculos);
    for (const acceso of estado.geo.entradas) {
      for (const tipo of tipos) {
        const tasas = perfil.intervalos.map((iv) => ((iv[acceso] && iv[acceso][tipo]) || 0) / intervalo);
        const f = { acceso, tipo, tasas, intervalo };
        f.proxima = this._siguiente(rng, f, 0);
        fuentes.push(f);
      }
    }

    // Puente: generador aparte.
    const rngP = mulberry32((semilla ^ 0x9e3779b9) >>> 0);
    const puente = [];
    const cfgP = conteos.puente;
    if (estado.geo.puente && cfgP) {
      const porSentido = (cfgP[estado.perfil] || 0) / 3600;
      const n = estado.geo.puente.fuente.carrilesPorSentido;
      for (const id of estado.geo.puente.carriles) {
        const f = { tramo: id, tasas: [porSentido / n], intervalo: 3600 };
        f.proxima = this._siguiente(rngP, f, 0);
        puente.push(f);
      }
    }
    return { rng, fuentes, rngP, puente, intervalo, nIntervalos: perfil.intervalos.length };
  },

  /** Nombre del intervalo de aforo en curso (p. ej. "17:25"). */
  intervaloActual(estado) {
    const L = estado.llegadas;
    const perfil = estado.conteos.perfiles[estado.perfil];
    const k = Math.floor(estado.t / L.intervalo) % L.nIntervalos;
    return perfil.intervalos[k].inicio;
  },

  _sortear(rng, probs) {
    const claves = Object.keys(probs).filter((k) => typeof probs[k] === 'number');
    const total = claves.reduce((s, k) => s + probs[k], 0);
    let x = rng() * total;
    for (const k of claves) {
      x -= probs[k];
      if (x <= 0) return k;
    }
    return claves[claves.length - 1];
  },

  _nuevoVehiculo(estado, acceso, tipo, tLlegada) {
    const tp = estado.param.vehiculos[tipo];
    const destino = this._sortear(estado.llegadas.rng, estado.conteos.destinos[acceso]);
    const ruta = Motor.crearRuta(estado.geo, acceso, destino);
    // Quien sigue por un ramal de giro libre no pasa por la línea de ceda (aunque comparta el carril de entrada).
    const ramal = ruta.some((t) => estado.geo.tramos[t.id].tipo === 'ramal');
    const carril = ramal ? 'ramal' : estado.geo.tramos[ruta[0].id].carril;
    return {
      id: estado.siguienteId++,
      tipo,
      acceso,
      destino,
      ruta,
      tramo: 0,
      carril,                // carril de entrada; 'filtro' si una moto se filtra; 'ramal' si gira por el ramal
      d: 0,                  // posición del frente sobre la ruta (m)
      v: 0,
      a: 0,
      largo: tp.largo,
      ancho: tp.ancho,
      estado: 'pendiente',   // pendiente → aproximando → en_cola → cruzando → alejandose → salio
      enRed: false,
      autorizado: carril === 'ramal', // lo decide control.js en la línea de ceda (el ramal cede en su unión)
      puente: false,
      nivel: 1,              // 1 = suelo (glorieta y accesos); 2 = Puente Ruta 90
      desfase: null,
      t_llegada: tLlegada,
      t_entrada_cola: null,
      t_linea: null,         // instante en que llegó a la línea de ceda (orden de paso)
      t_cruce: null,
      t_salida: null,
    };
  },

  /** Espacio libre al inicio de un tramo de entrada (cola del último vehículo que lo ocupa). */
  _huecoInicio(estado, tramoId) {
    let min = Infinity;
    let vUlt = Infinity;
    for (const v of estado.vehiculos) {
      if (v.tramo !== 0 || v.ruta[0].id !== tramoId) continue;
      const cola = v.d - v.largo;
      if (cola < min) { min = cola; vUlt = v.v; }
    }
    return { hueco: min, v: vUlt };
  },

  _insertar(estado, veh, vDeseada) {
    const tp = estado.param.vehiculos[veh.tipo];
    const { hueco, v } = this._huecoInicio(estado, veh.ruta[0].id);
    let vIngreso = vDeseada * 0.8;
    if (hueco !== Infinity) {
      vIngreso = Math.min(vIngreso, v);
      if (hueco < tp.distMinima + vIngreso * tp.tiempoSeguimiento * 0.6) return false;
    }
    veh.v = vIngreso;
    veh.enRed = true;
    estado.vehiculos.push(veh);
    return true;
  },

  paso(estado, dt) {
    const gen = estado.llegadas;

    // 1a) Generar llegadas cuyo instante ya ocurrió.
    for (const f of gen.fuentes) {
      while (f.proxima <= estado.t) {
        estado.pendientes[f.acceso].push(this._nuevoVehiculo(estado, f.acceso, f.tipo, f.proxima));
        f.proxima = this._siguiente(gen.rng, f, f.proxima);
      }
    }

    // 1b) Insertar pendientes (en orden de llegada, carril por carril).
    for (const id of Object.keys(estado.pendientes)) {
      const cola = estado.pendientes[id];
      const bloqueados = new Set();
      const acc = estado.geo.accesos[id];
      const nCarriles = new Set(acc.carrilesEntrada.map((c) => c.entrada).concat(acc.ramal ? [acc.ramal.entrada] : [])).size;
      for (let i = 0; i < cola.length && bloqueados.size < nCarriles; i++) {
        const veh = cola[i];
        const carril = veh.ruta[0].id;
        if (bloqueados.has(carril)) continue;
        if (this._insertar(estado, veh, estado.param.vehiculos[veh.tipo].velDeseada)) {
          if (veh.estado === 'pendiente') veh.estado = 'aproximando';
          cola.splice(i, 1);
          i--;
        } else {
          bloqueados.add(carril);
        }
      }
      // RF-04: una moto que espera afuera porque su carril está lleno no se queda atrás de la
      // fila: entra por el carril virtual de filtrado (entre los dos carriles) si allí cabe y si
      // esa fila es más corta que la de su carril (incluidos los que esperan afuera).
      const filtro = acc.filtro;
      if (filtro && estado.param.motos.filtrado) {
        for (let i = 0; i < cola.length; i++) {
          const veh = cola[i];
          if (veh.tipo !== 'moto' || veh.carril === 'ramal') continue;
          const ruta0 = veh.ruta[0];
          const enCarril = Vehiculos.filaAdelante(estado, ruta0.id, -Infinity) + cola.slice(0, i).filter((o) => o.ruta[0].id === ruta0.id).length;
          if (Vehiculos.filaAdelante(estado, filtro, -Infinity) >= enCarril) break;
          veh.ruta[0] = Object.assign({}, ruta0, { id: filtro });
          veh.carril = 'filtro';
          if (this._insertar(estado, veh, estado.param.motos.velMaxFiltrado)) {
            if (veh.estado === 'pendiente') veh.estado = 'aproximando';
            cola.splice(i, 1);
          } else {
            veh.ruta[0] = ruta0;
            veh.carril = estado.geo.tramos[ruta0.id].carril; // (las motos de un ramal nunca llegan aquí)
          }
          break; // como mucho una moto por paso y acceso (y solo la primera de la fila)
        }
      }
      // Los que siguen afuera ya están haciendo cola (aunque no se vean).
      for (const veh of cola) {
        if (veh.estado === 'pendiente') {
          veh.estado = 'en_cola';
          veh.t_entrada_cola = veh.t_llegada;
        }
      }
    }

    // 1c) Puente Ruta 90 (nivel 2) (flujo libre; si no cabe, el vehículo se descarta).
    const tipos = estado.conteos.puente ? estado.conteos.puente.mezcla : null;
    for (const f of gen.puente) {
      while (f.proxima <= estado.t) {
        const tipo = this._sortear(gen.rngP, tipos);
        const tp = estado.param.vehiculos[tipo];
        const tramo = estado.geo.tramos[f.tramo];
        const veh = {
          id: estado.siguienteId++, tipo, acceso: null, destino: null,
          ruta: Motor._ruta([{ id: tramo.id, s0: 0, largo: tramo.largo }]),
          tramo: 0, carril: 0, d: 0, v: 0, a: 0, largo: tp.largo, ancho: tp.ancho,
          estado: 'aproximando', enRed: true, autorizado: true, puente: true, nivel: 2, desfase: null,
          t_llegada: f.proxima, t_entrada_cola: null, t_cruce: null, t_salida: null,
        };
        this._insertar(estado, veh, tramo.vMax);
        f.proxima = this._siguiente(gen.rngP, f, f.proxima);
      }
    }
  },
};
