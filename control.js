/* =========================================================================
 * control.js — Paso 2 del motor: ¿quién puede entrar a la intersección?
 *
 * Tres modos intercambiables en caliente (sin recargar):
 *   - 'actual'      : prelación / oportunidad. La vía principal pasa cuando
 *                     la caja está libre; la secundaria solo entra si no
 *                     viene ningún vehículo de la principal dentro de la
 *                     brecha crítica (s).
 *   - 'semaforo'    : semáforo virtual de 2 fases (E–O y N–S) con amarillo
 *                     y todo-rojo. Nunca hay verdes en conflicto.
 *   - 'alternativa' : un agente de tránsito da turnos fijos a cada acceso,
 *                     en orden, con un tiempo de despeje entre turnos.
 *
 * Regla de seguridad común a los tres modos: un vehículo solo se autoriza
 * si no hay vehículos autorizados del eje perpendicular dentro de la caja
 * o en camino a ella. Así nunca se cruzan trayectorias en conflicto.
 *
 * Solo marca `veh.autorizado = true`; no mueve vehículos ni conoce el DOM.
 * ========================================================================= */
'use strict';

const Control = {
  MODOS: {
    actual: 'Actual (prelación)',
    semaforo: 'Semáforo virtual',
    alternativa: 'Alternativa (agente)',
  },

  crear(param) {
    const ctrl = { modo: param.control.modoInicial, faseIdx: 0, tFase: 0, luces: {} };
    return ctrl;
  },

  cambiarModo(estado, modo) {
    if (!this.MODOS[modo]) throw new Error('Modo desconocido: ' + modo);
    const ctrl = estado.control;
    ctrl.modo = modo;
    ctrl.faseIdx = 0;
    ctrl.tFase = 0;
    // Los vehículos ya autorizados terminan su cruce; el resto espera la nueva regla.
  },

  /** Secuencia de fases del modo actual (se recalcula para aceptar cambios en vivo). */
  fases(estado) {
    const c = estado.param.control;
    if (estado.control.modo === 'semaforo') {
      const s = c.semaforo;
      return [
        { eje: 'EO', luz: 'verde', dur: s.verdeEO },
        { eje: 'EO', luz: 'amarillo', dur: s.amarillo },
        { eje: null, luz: 'rojo', dur: s.todoRojo },
        { eje: 'NS', luz: 'verde', dur: s.verdeNS },
        { eje: 'NS', luz: 'amarillo', dur: s.amarillo },
        { eje: null, luz: 'rojo', dur: s.todoRojo },
      ];
    }
    if (estado.control.modo === 'alternativa') {
      const a = c.alternativa;
      const lista = [];
      for (const acceso of a.orden) {
        lista.push({ acceso, luz: 'verde', dur: a.turno });
        lista.push({ acceso: null, luz: 'rojo', dur: a.despeje });
      }
      return lista;
    }
    return [];
  },

  faseActual(estado) {
    const f = this.fases(estado);
    if (f.length === 0) return null;
    const ctrl = estado.control;
    if (ctrl.faseIdx >= f.length) ctrl.faseIdx = 0;
    return Object.assign({ restante: Math.max(0, f[ctrl.faseIdx].dur - ctrl.tFase) }, f[ctrl.faseIdx]);
  },

  _avanzarFases(estado, dt) {
    const f = this.fases(estado);
    const ctrl = estado.control;
    if (f.length === 0) return;
    ctrl.tFase += dt;
    // Fases de duración 0 se saltan; el tope evita un bucle infinito si todo vale 0.
    let guardia = f.length;
    while (ctrl.tFase >= f[ctrl.faseIdx % f.length].dur - 1e-9 && guardia-- > 0) {
      ctrl.tFase -= Math.max(0, f[ctrl.faseIdx % f.length].dur);
      ctrl.faseIdx = (ctrl.faseIdx + 1) % f.length;
    }
    if (ctrl.tFase < 0) ctrl.tFase = 0;
  },

  _actualizarLuces(estado) {
    const ctrl = estado.control;
    const fase = this.faseActual(estado);
    for (const id of Object.keys(estado.geo.accesos)) {
      const acc = estado.geo.accesos[id];
      if (!fase) ctrl.luces[id] = null; // modo actual: no hay luces
      else if (ctrl.modo === 'semaforo') ctrl.luces[id] = fase.eje === acc.eje ? fase.luz : 'rojo';
      else ctrl.luces[id] = fase.acceso === id ? 'verde' : 'rojo';
    }
  },

  /** Reglas propias de cada modo para un candidato. */
  _permite(estado, veh) {
    const ctrl = estado.control;
    const geo = estado.geo;
    const tp = estado.param.vehiculos[veh.tipo];
    const dist = geo.sParada - veh.s;

    if (ctrl.modo === 'actual') {
      const cfg = estado.param.control.actual;
      if (veh.eje === cfg.ejePrincipal) return true;
      // Vía secundaria: ¿hay una brecha suficiente en la principal?
      for (const o of estado.vehiculos) {
        if (o.eje !== cfg.ejePrincipal || o.autorizado || o.s > geo.sParada) continue;
        const tLlegar = (geo.sParada - o.s) / Math.max(o.v, 0.1);
        if (tLlegar < cfg.brechaCritica) return false;
      }
      return true;
    }

    if (ctrl.modo === 'semaforo') {
      const luz = ctrl.luces[veh.acceso];
      if (luz === 'verde') return true;
      if (luz === 'amarillo') {
        // Sigue solo si ya no alcanza a frenar con comodidad.
        return dist < (veh.v * veh.v) / (2 * tp.decelComoda);
      }
      return false;
    }

    if (ctrl.modo === 'alternativa') {
      return ctrl.luces[veh.acceso] === 'verde';
    }
    return false;
  },

  paso(estado, dt) {
    this._avanzarFases(estado, dt);
    this._actualizarLuces(estado);

    const geo = estado.geo;
    const dDec = estado.param.control.distanciaDecision;

    // Vehículos autorizados que todavía no han liberado la caja, por eje.
    const activos = { NS: 0, EO: 0 };
    for (const v of estado.vehiculos) if (v.autorizado && !v.fueraCaja) activos[v.eje]++;

    // Candidatos: el primer vehículo no autorizado de cada carril, cerca de la línea de pare.
    const primeros = new Map();
    for (const v of estado.vehiculos) {
      if (v.autorizado || v.s > geo.sParada + 1e-6) continue;
      const clave = v.acceso + '|' + v.carril;
      const actual = primeros.get(clave);
      if (!actual || v.s > actual.s) primeros.set(clave, v);
    }
    const candidatos = [...primeros.values()]
      .filter((v) => geo.sParada - v.s <= dDec)
      .sort((a, b) => b.s - a.s || a.id - b.id);

    for (const c of candidatos) {
      const otroEje = c.eje === 'NS' ? 'EO' : 'NS';
      if (activos[otroEje] > 0) continue;
      if (this._permite(estado, c)) {
        c.autorizado = true;
        activos[c.eje]++;
      }
    }
  },
};
