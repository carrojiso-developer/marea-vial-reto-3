/* =========================================================================
 * control.js — Paso 2 del motor: ¿quién puede entrar a la glorieta y quién
 * cede en cada punto de conflicto? (solo nivel 1; el Puente Ruta 90 es el
 * nivel 2 y nunca participa)
 *
 * Entradas al anillo: Carrera 15 (NO, 2 carriles ↓), Corredor inferior (SE, ↗),
 * Corredor Este (E, ←) y Calle 40 / Paralela (NE, ↙). Salidas: Carrera 15 (↑),
 * Carrera 15 Sur (↙), Ramal inferior (↓), Corredor Este (→) y Calle 40 (↗).
 *
 * Tres modos intercambiables en caliente (sin recargar):
 *   - 'actual'      : PRELACIÓN. Quien ya circula en el anillo (antihorario)
 *                     tiene la vía. Un vehículo de una entrada solo pasa la
 *                     línea de ceda si ningún vehículo del anillo llega a su
 *                     punto de entrada antes de la brecha crítica (s).
 *   - 'semaforo'    : semáforo virtual en las entradas al anillo, una a la vez,
 *                     con verde, amarillo y todo-rojo (control.semaforo.verde<ID>).
 *                     Nunca hay dos verdes a la vez; mientras una entrada
 *                     está en verde, el anillo le cede el paso frente a ella.
 *   - 'alternativa' : agentes de tránsito que dan paso POR DEMANDA, como un
 *                     agente real: en cada cambio de turno (tras el despeje)
 *                     miran la cola de cada entrada y le dan paso a la que
 *                     tiene más vehículos esperando (las que tienen 0 no
 *                     reciben turno). El turno sigue abierto hasta que esa
 *                     cola baja a control.alternativa.colaVaciado (2) o se
 *                     cumple el tope de seguridad turnoMaximo (40 s); nunca
 *                     dura menos de turnoMinimo. El agente detiene el anillo
 *                     frente a la entrada que tiene el turno.
 *
 * Prioridad en un punto de conflicto (rango mayor = tiene la vía):
 *   salida (3.5) > anillo (3) > conector de entrada (1). Es decir: quien
 *   circula tiene prelación sobre quien entra, y quien sale desde el carril
 *   interno cruza delante del carril externo (evita que el anillo se trabe).
 *   En semáforo/alternativa la entrada con verde sube a 4.
 *   En las divergencias (inicio de cada salida) solo se respeta la ocupación.
 * El giro libre del corredor inferior hacia el Este (ramal) no pasa por la
 * línea de ceda ni por el semáforo: entra autorizado y cede (rango 1) al
 * unirse a la salida Este.
 * Quien no tiene prioridad espera antes de la zona si hay una amenaza; nadie
 * entra a una zona ocupada; y una vez dentro de la zona, se termina de pasar.
 *
 * No mueve vehículos ni conoce el DOM.
 * ========================================================================= */
'use strict';

const Control = {
  DESTRABE_TOTAL: 30,    // s detenido dentro de la glorieta tras los cuales ignora los conflictos unos metros (último recurso)
  LLENADO_CEDE: 0.5,    // el anillo solo cede a una entrada en verde si está por debajo de este llenado
  LLENADO_MAXIMO: 0.7,   // nadie entra a un carril del anillo más lleno que esto (anti-bloqueo)

  MODOS: {
    actual: 'Actual (prelación)',
    semaforo: 'Semáforo virtual',
    alternativa: 'Alternativa (agentes)',
  },

  crear(param) {
    return { modo: param.control.modoInicial, faseIdx: 0, tFase: 0, agente: null, luces: {}, cacheDescarga: { paso: -1, valores: {} } };
  },

  cambiarModo(estado, modo) {
    if (!this.MODOS[modo]) throw new Error('Modo desconocido: ' + modo);
    const ctrl = estado.control;
    ctrl.modo = modo;
    ctrl.faseIdx = 0;
    ctrl.tFase = 0;
    ctrl.agente = null; // el agente vuelve a mirar las colas desde cero
    // Los vehículos que ya pasaron la línea terminan su recorrido; el resto espera la nueva regla.
  },

  /** Secuencia de fases del modo actual (se recalcula para aceptar cambios en vivo). */
  fases(estado) {
    const c = estado.param.control;
    const entradas = estado.geo.entradas;
    if (estado.control.modo === 'semaforo') {
      const s = c.semaforo;
      const lista = [];
      // Mismo orden que los turnos de los agentes (sentido de giro del anillo); las demás entradas al final.
      const orden = (c.alternativa.orden || []).filter((x) => entradas.includes(x));
      for (const x of entradas) if (!orden.includes(x)) orden.push(x);
      for (const acceso of orden) {
        lista.push({ acceso, luz: 'verde', dur: s['verde' + acceso] ?? 20 });
        lista.push({ acceso, luz: 'amarillo', dur: s.amarillo });
        lista.push({ acceso: null, luz: 'rojo', dur: s.todoRojo });
      }
      return lista;
    }
    return []; // 'actual' no tiene fases; 'alternativa' no sigue una secuencia fija (ver _avanzarAgente)
  },

  faseActual(estado) {
    if (estado.control.modo === 'alternativa') return this._faseAgente(estado);
    const f = this.fases(estado);
    if (f.length === 0) return null;
    const ctrl = estado.control;
    if (ctrl.faseIdx >= f.length) ctrl.faseIdx = 0;
    return Object.assign({ restante: Math.max(0, f[ctrl.faseIdx].dur - ctrl.tFase) }, f[ctrl.faseIdx]);
  },

  _avanzarFases(estado, dt) {
    if (estado.control.modo === 'alternativa') return this._avanzarAgente(estado, dt);
    const f = this.fases(estado);
    const ctrl = estado.control;
    if (f.length === 0) return;
    ctrl.tFase += dt;
    let guardia = f.length;
    while (ctrl.tFase >= f[ctrl.faseIdx % f.length].dur - 1e-9 && guardia-- > 0) {
      ctrl.tFase -= Math.max(0, f[ctrl.faseIdx % f.length].dur);
      ctrl.faseIdx = (ctrl.faseIdx + 1) % f.length;
    }
    if (ctrl.tFase < 0) ctrl.tFase = 0;
  },

  /* ------------- Modo alternativa: agente de tránsito por demanda de cola ------------- */

  /**
   * Vehículos esperando para entrar al anillo por un acceso: los que siguen antes de la línea de
   * ceda sin autorización (en cola, o ya a menos de distanciaDecision de la línea) y los que
   * esperan fuera del tramo dibujado. Los del giro libre (ramal) solo cuentan si están atascados
   * en la misma fila (carril compartido del corredor inferior), porque también esperan ese paso.
   */
  colaAcceso(estado, id) {
    const dDec = estado.param.control.distanciaDecision;
    let n = 0;
    for (const v of estado.vehiculos) {
      if (v.acceso !== id || v.puente || v.tramo !== 0) continue;
      if (v.carril === 'ramal') { if (v.estado === 'en_cola') n++; continue; }
      if (!v.autorizado && (v.estado === 'en_cola' || v.ruta[0].largo - v.d <= dDec)) n++;
    }
    n += (estado.pendientes[id] || []).length;
    return n;
  },

  /**
   * Entrada con más vehículos esperando (null si todas están en 0). Empate: la siguiente en `orden`.
   * `excluir`: acceso que agotó el tope; solo vuelve a recibir turno si ninguna otra entrada espera.
   */
  _elegirTurno(estado, anterior, excluir) {
    const entradas = estado.geo.entradas;
    const orden = (estado.param.control.alternativa.orden || []).filter((x) => entradas.includes(x));
    for (const x of entradas) if (!orden.includes(x)) orden.push(x);
    const k = anterior ? orden.indexOf(anterior) + 1 : 0;
    let mejor = null;
    let max = 0;
    for (const id of orden.slice(k).concat(orden.slice(0, k))) {
      if (id === excluir) continue;
      const n = this.colaAcceso(estado, id);
      if (n > max) { max = n; mejor = id; }
    }
    if (!mejor && excluir && this.colaAcceso(estado, excluir) > 0) mejor = excluir;
    return mejor;
  },

  _avanzarAgente(estado, dt) {
    const a = estado.param.control.alternativa;
    const tope = a.turnoMaximo ?? 40;
    const minimo = Math.min(a.turnoMinimo ?? 5, tope);
    const umbral = a.colaVaciado ?? 2;
    const despeje = a.despeje ?? 0;
    const ag = estado.control.agente || (estado.control.agente = { fase: 'espera', acceso: null, anterior: null, t: 0 });
    ag.t += dt;
    if (ag.fase === 'turno') {
      // Fin del turno: la cola bajó a `umbral` (tras el mínimo) o se cumplió el tope de seguridad.
      const agotado = ag.t >= tope - 1e-9;
      if (agotado || (ag.t >= minimo - 1e-9 && this.colaAcceso(estado, ag.acceso) <= umbral)) {
        // Si agotó el tope, el siguiente turno es para otra entrada (no se le encadena otro bloque).
        ag.excluir = agotado ? ag.acceso : null;
        ag.anterior = ag.acceso;
        ag.acceso = null;
        ag.t = 0;
        ag.fase = despeje > 0 ? 'despeje' : 'espera';
      }
    }
    if (ag.fase === 'despeje' && ag.t >= despeje - 1e-9) {
      ag.fase = 'espera';
      ag.t = 0;
    }
    if (ag.fase === 'espera') {
      // Todo en rojo hasta que alguna entrada tenga vehículos esperando; entonces, la más cargada.
      const id = this._elegirTurno(estado, ag.anterior, ag.excluir);
      if (id) Object.assign(ag, { fase: 'turno', acceso: id, t: 0, excluir: null });
    }
  },

  _faseAgente(estado) {
    const a = estado.param.control.alternativa;
    const ag = estado.control.agente;
    if (!ag || ag.fase === 'espera') return { acceso: null, luz: 'rojo', restante: 0 };
    if (ag.fase === 'despeje') return { acceso: null, luz: 'rojo', restante: Math.max(0, (a.despeje ?? 0) - ag.t) };
    // `restante` es el máximo que le queda: el turno termina antes si la cola se vacía.
    return { acceso: ag.acceso, luz: 'verde', restante: Math.max(0, (a.turnoMaximo ?? 40) - ag.t) };
  },

  _actualizarLuces(estado) {
    const ctrl = estado.control;
    const fase = this.faseActual(estado);
    for (const id of estado.geo.entradas) {
      if (!fase) ctrl.luces[id] = null; // modo actual: no hay luces
      else ctrl.luces[id] = fase.acceso === id ? fase.luz : 'rojo';
    }
  },

  /** Rango de prioridad de un tramo en este instante. */
  rango(estado, tramo) {
    if (tramo.tipo === 'conector' && estado.control.modo !== 'actual') {
      const luz = estado.control.luces[tramo.acceso];
      if ((luz === 'verde' || luz === 'amarillo') && this._anilloDescarga(estado, tramo) && this.llenadoAnillo(estado, tramo.anillo) < this.LLENADO_CEDE) return 4;
    }
    return tramo.rango;
  },

  /** Fracción del carril k del anillo ocupada por vehículos (con su distancia mínima). */
  llenadoAnillo(estado, k) {
    const cache = this._cache(estado);
    const clave = 'llenado_' + k;
    if (!(clave in cache)) {
      const anillo = estado.geo.tramos['anillo_' + k];
      let suma = 0;
      for (const e of estado.ocupacion[anillo.id] || []) {
        suma += e.parte + estado.param.vehiculos[e.veh.tipo].distMinima * (e.parte / e.veh.largo);
      }
      cache[clave] = suma / anillo.largo;
    }
    return cache[clave];
  },

  _cache(estado) {
    const c = estado.control.cacheDescarga;
    if (c.paso !== estado.paso) { c.paso = estado.paso; c.valores = {}; }
    return c.valores;
  },

  /**
   * ¿El anillo justo después de esta entrada se está moviendo? Si allí hay
   * vehículos detenidos, el semáforo/agente ya no detiene el anillo para
   * meter más carros (así se evita que la glorieta se "trabe" completa).
   * Se calcula una vez por paso y por conector.
   */
  _anilloDescarga(estado, conector) {
    const cache = this._cache(estado);
    if (conector.id in cache) return cache[conector.id];
    const anillo = estado.geo.tramos['anillo_' + conector.anillo];
    let libre = true;
    for (const e of estado.ocupacion[anillo.id] || []) {
      if (e.veh.v < 1 && Red.solapa(anillo, e.sT, e.parte, conector.sFusion, conector.sFusion + 25)) { libre = false; break; }
    }
    cache[conector.id] = libre;
    return libre;
  },

  tienePrioridad(estado, tramoA, tramoB) {
    const rA = this.rango(estado, tramoA);
    const rB = this.rango(estado, tramoB);
    return rA > rB || (rA === rB && tramoA.id < tramoB.id);
  },

  /**
   * Evalúa un punto de conflicto c (visto desde el tramo `propio`) para `veh`.
   * Devuelve 'ocupado' (hay alguien del otro tramo en la zona), 'amenaza'
   * (no tiene prioridad y un vehículo con prioridad llega antes de la brecha)
   * o 'libre'.
   */
  evaluarConflicto(estado, veh, propio, c) {
    const geo = estado.geo;
    const ocup = estado.ocupacion;
    const otro = geo.tramos[c.otro];
    // En divergencias la zona empieza 0.2 m después del punto donde se separan (así una fila que
    // sale por ahí no se bloquea a sí misma).
    const desde = c.sOtro - c.w + (c.tipo === 'divergencia' ? 0.2 : 0);
    for (const e of ocup[c.otro] || []) {
      if (e.veh !== veh && Red.solapa(otro, e.sT, e.parte, desde, c.sOtro + c.w)) return 'ocupado';
    }
    if (c.tipo === 'divergencia' || this.tienePrioridad(estado, propio, otro)) return 'libre';

    const T = estado.param.control.actual.brechaCritica;
    const vistos = new Set();
    for (const id of [c.otro, ...otro.predecesores]) {
      for (const e of ocup[id] || []) {
        const o = e.veh;
        if (o === veh || vistos.has(o) || !o.autorizado) continue;
        vistos.add(o);
        const dist = Red.distanciaA(geo, o, c.otro, c.sOtro);
        if (dist === null || dist - c.w > o.v * T + 1.5) continue;
        if (o.v < 0.5) {
          // Un vehículo detenido que tampoco tiene espacio para salir de la zona no es amenaza
          // (si se le cediera el paso a alguien que no puede avanzar, ambos quedarían trabados).
          const lo = Vehiculos.lider(estado, o);
          if (lo.veh && lo.gap + lo.veh.v * 2 < dist + c.w + o.largo + 0.5) continue;
        }
        return 'amenaza';
      }
    }
    return 'libre';
  },

  /** Reglas propias de cada modo para un candidato parado en (o cerca de) la línea de ceda. */
  _permite(estado, veh) {
    const ctrl = estado.control;
    const tp = estado.param.vehiculos[veh.tipo];
    const dist = veh.ruta[0].largo - veh.d;

    if (ctrl.modo === 'actual') {
      // Prelación del anillo: revisar todos los conflictos del conector, hasta la fusión.
      const tr = veh.ruta[1];
      const propio = estado.geo.tramos[tr.id];
      for (const c of propio.conflictos) {
        if (this.evaluarConflicto(estado, veh, propio, c) !== 'libre') return false;
      }
      // No bloquear el anillo: debe haber espacio después de la fusión.
      const lider = Vehiculos.lider(estado, veh);
      if (lider.veh && lider.veh.v < 1) {
        const libreHasta = veh.d + lider.gap;
        if (libreHasta < veh.ruta[1].d0 + veh.ruta[1].largo + veh.largo + 1) return false;
      }
      return true;
    }

    // También con verde: no se entra si no hay espacio después de la fusión (no "bloquear la caja").
    const lider = Vehiculos.lider(estado, veh);
    if (lider.veh && lider.veh.v < 1 && veh.d + lider.gap < veh.ruta[1].d0 + veh.ruta[1].largo + veh.largo + 1) return false;

    // Con verde tampoco se mete al anillo si justo después de la fusión el anillo está detenido:
    // con varias entradas, meter carros a un anillo represado termina trabándolo en círculo.
    const conector = estado.geo.tramos[veh.ruta[1].id];
    if (!this._anilloDescarga(estado, conector)) return false;

    const luz = ctrl.luces[veh.acceso];
    if (luz === 'verde') return true;
    if (luz === 'amarillo' && ctrl.modo === 'semaforo') {
      return dist < (veh.v * veh.v) / (2 * tp.decelComoda); // ya no alcanza a frenar con comodidad
    }
    return false;
  },

  paso(estado, dt) {
    this._avanzarFases(estado, dt);
    this._actualizarLuces(estado);

    const dDec = estado.param.control.distanciaDecision;
    // Candidatos: el primer vehículo no autorizado de cada carril de entrada (y del filtro de motos).
    const primeros = new Map();
    for (const v of estado.vehiculos) {
      if (v.autorizado || v.tramo !== 0) continue;
      const clave = v.ruta[0].id;
      const actual = primeros.get(clave);
      if (!actual || v.d > actual.d) primeros.set(clave, v);
    }
    const candidatos = [...primeros.values()].filter((v) => v.ruta[0].largo - v.d <= dDec);
    for (const v of candidatos) {
      if (v.t_linea === null && v.ruta[0].largo - v.d <= 1.0) v.t_linea = estado.t;
    }
    // Primero el que llegó antes a la línea: así una moto filtrada no queda relegada
    // detrás de cada carro nuevo que se arrima a la línea en su carril.
    candidatos.sort((a, b) => (a.t_linea ?? Infinity) - (b.t_linea ?? Infinity) || b.d - a.d || a.id - b.id);

    // Cremallera (RF-04): si una moto filtrada ya espera en la línea, los carros de ese carril
    // que todavía no llegan a la línea la dejan entrar primero.
    const motoEsperando = new Map();
    for (const c of candidatos) if (c.carril === 'filtro' && c.t_linea !== null) motoEsperando.set(c.ruta[1].id, c.t_linea);

    const conectoresTomados = new Set();
    for (const c of candidatos) {
      const conector = c.ruta[1].id;
      if (c.carril !== 'filtro' && motoEsperando.has(conector) && (c.t_linea === null || c.t_linea > motoEsperando.get(conector))) continue;
      // Una moto filtrada y el carro de su carril no arrancan en el mismo instante.
      if (conectoresTomados.has(conector)) continue;
      if (c.carril === 'filtro' && this._carrilArrancando(estado, c)) continue;
      // Anti-bloqueo (todos los modos): no se entra a un carril del anillo casi lleno.
      if (this.llenadoAnillo(estado, estado.geo.tramos[conector].anillo) > this.LLENADO_MAXIMO) continue;
      if (this._permite(estado, c)) {
        c.autorizado = true;
        conectoresTomados.add(conector);
      }
    }
  },

  /** ¿El vehículo del carril al que se va a meter la moto filtrada está arrancando junto a ella? */
  _carrilArrancando(estado, moto) {
    const tramoCarril = estado.geo.tramos[moto.ruta[1].id].predecesores[0];
    const linea = moto.ruta[0].largo;
    for (const e of estado.ocupacion[tramoCarril] || []) {
      const o = e.veh;
      if (o.autorizado && o.tramo === 0 && o.d > linea - 4) return true;
    }
    for (const e of estado.ocupacion[moto.ruta[1].id] || []) {
      if (e.sT < 1.0) return true; // la boca del conector todavía está ocupada
    }
    return false;
  },
};
