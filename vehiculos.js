/* =========================================================================
 * vehiculos.js — Paso 3 del motor: movimiento.
 *
 * Cada vehículo avanza sobre su ruta (entrada → conector → anillo → salida →
 * cola de la salida; o entrada → ramal → cola en el giro libre del corredor
 * inferior) y `d` es la posición de su frente sobre ella. La aceleración sigue el
 * modelo IDM (Intelligent Driver Model) frente al obstáculo más cercano:
 *   - el vehículo de adelante EN SU CAMINO (aunque venga de otro tramo,
 *     p. ej. alguien que acaba de fundirse al anillo delante de él),
 *   - la línea de ceda si control.js todavía no lo autoriza,
 *   - un punto de conflicto donde le toca ceder (o que está ocupado).
 * Además hay restricciones duras: nunca se avanza más allá de la cola del
 * líder menos 0.5 m ni se pasa la línea o una zona de conflicto bloqueada.
 *
 * Filtrado de motos (RF-04): una moto detenida detrás de una fila (carros,
 * busetas o incluso otras motos que esperan detrás de ellos) pasa al carril
 * virtual entre los dos carriles de entrada y avanza por ahí hasta la línea
 * de ceda, donde se mete al conector de su carril delante del carro parado.
 *
 * Aislamiento entre niveles: los vehículos del Puente Ruta 90 (nivel 2) solo
 * siguen a su líder en su propio carril del puente; nunca ven, ceden, frenan
 * ni chocan con los del suelo (nivel 1), y viceversa.
 *
 * No conoce el canvas ni el DOM.
 * ========================================================================= */
'use strict';

const Vehiculos = {
  HUECO_FISICO: 0.5,  // separación mínima absoluta entre parachoques (m)
  HORIZONTE: 60,      // hasta dónde se mira adelante buscando líder (m)
  HORIZONTE_CONFLICTO: 35,
  TRAMO_HERMANOS: 10, // m iniciales de dos conectores del mismo carril de entrada que se tratan como uno

  /** Aceleración IDM. gap = distancia libre al obstáculo, vLider = su velocidad. */
  idm(veh, tp, vDeseada, gap, vLider) {
    const a = tp.acelMax;
    const b = tp.decelComoda;
    let acc = a * (1 - Math.pow(veh.v / Math.max(vDeseada, 0.1), 4));
    if (gap !== Infinity) {
      const dv = veh.v - vLider;
      const sEstrella = tp.distMinima + Math.max(0, veh.v * tp.tiempoSeguimiento + (veh.v * dv) / (2 * Math.sqrt(a * b)));
      const g = Math.max(gap, 0.01);
      acc -= a * (sEstrella / g) * (sEstrella / g);
    }
    return Math.max(acc, -tp.decelMax);
  },

  /** Vehículo más cercano adelante en el camino de `veh` (según la foto de ocupación del paso). */
  lider(estado, veh) {
    const geo = estado.geo;
    const ocup = estado.ocupacion;
    const myd = veh.d;
    let gap = Infinity;
    let lider = null;
    for (let j = veh.tramo; j < veh.ruta.length; j++) {
      const tr = veh.ruta[j];
      if (tr.d0 > myd + this.HORIZONTE) break;
      const tramo = geo.tramos[tr.id];
      let lista = ocup[tr.id];
      if (tramo.hermanos) {
        // Primeros metros de un conector hermano (mismo carril de entrada): cuentan como el propio.
        const extra = [];
        for (const h of tramo.hermanos) for (const e of ocup[h] || []) if (e.sT < this.TRAMO_HERMANOS) extra.push(e);
        if (extra.length) lista = (lista || []).concat(extra);
      }
      if (!lista) continue;
      for (const e of lista) {
        if (e.veh === veh) continue;
        if ((e.veh.nivel || 1) !== (veh.nivel || 1)) continue; // otro nivel: pasa por encima/debajo
        let dt = e.sT - tr.s0;
        if (tramo.cerrado) {
          dt = Red.mod(dt, tramo.largo);
          if (dt > tramo.largo - e.parte - 1e-6) dt -= tramo.largo; // pedazo que cruza el inicio del recorrido
        }
        if (dt > tr.largo || dt + e.parte < 0) continue;
        const Dt = tr.d0 + dt;
        if (Dt + e.parte <= myd + 1e-6) continue; // está detrás o al lado
        const g = Math.max(0, Dt - myd);
        if (g < gap) { gap = g; lider = e.veh; }
      }
    }
    return { veh: lider, gap };
  },

  /** Distancia (sobre la ruta) donde el vehículo debe detenerse por un conflicto; Infinity si no. */
  _paradaConflicto(estado, veh, tp, lider) {
    const geo = estado.geo;
    const myd = veh.d;
    const frenado = (veh.v * veh.v) / (2 * tp.decelMax);
    let parada = Infinity;
    const zonas = []; // zonas de conflicto que todavía tiene por delante (para no detenerse encima)
    for (let j = veh.tramo; j < veh.ruta.length; j++) {
      const tr = veh.ruta[j];
      if (tr.d0 > myd + this.HORIZONTE_CONFLICTO) break;
      const tramo = geo.tramos[tr.id];
      for (const c of tramo.conflictos) {
        let delta = c.s - tr.s0;
        if (tramo.cerrado) delta = Red.mod(delta, tramo.largo);
        if (delta < 0 || delta > tr.largo) continue;
        // En una divergencia, quien va a tomar esa misma salida no se frena por ella (la sigue).
        if (c.tipo === 'divergencia' && geo.tramos[c.otro].tipo === 'salida' && veh.ruta.some((t) => t.id === c.otro)) continue;
        const Dc = tr.d0 + delta;
        const espera = Dc - c.w - 0.3;
        if (Dc - c.w <= myd) continue;                       // ya está dentro: termina de pasar
        if (espera - myd > this.HORIZONTE_CONFLICTO) continue;
        const r = Control.evaluarConflicto(estado, veh, tramo, c);
        const puedeFrenar = espera - myd > frenado - 0.5;
        if (puedeFrenar && c.tipo === 'cruce' && geo.tramos[c.otro].tipo === 'salida') zonas.push({ ini: Dc - c.w, fin: Dc + c.w });
        let detener = r === 'ocupado' || (r === 'amenaza' && puedeFrenar);
        // Quien ya circula en el anillo solo "guarda" los cruces de las salidas (que vacían el anillo);
        // ante una entrada sigue a su líder, como en la vía real.
        const guarda = tramo.tipo !== 'anillo' || geo.tramos[c.otro].tipo === 'salida';
        if (!detener && guarda && c.tipo !== 'divergencia' && lider.veh && puedeFrenar) {
          // "No bloquee la zona": nadie (con o sin prioridad) entra si adelante no hay espacio para salir de ella.
          const libreHasta = myd + lider.gap + lider.veh.v * 2;
          if (libreHasta < Dc + c.w + veh.largo + 0.5) detener = true;
        }
        if (detener && espera < parada) parada = espera;
      }
    }
    // "Mantenga despejada la salida": si tiene que detenerse, que su carrocería no quede encima del
    // cruce por donde salen los del carril interno (p. ej. la cola de una buseta); en ese caso se
    // detiene antes. Las salidas son las que vacían el anillo: si se tapan, puede trabarse en círculo.
    // Solo cruces con salidas y un solo paso (sin encadenar zonas), para no frenar lejos del obstáculo.
    if (parada < Infinity) {
      let nueva = parada;
      for (const z of zonas) {
        if (z.ini - 0.3 < parada && z.fin > parada - veh.largo) nueva = Math.min(nueva, z.ini - 0.3);
      }
      parada = nueva;
    }
    return parada;
  },

  /** Velocidad deseada mirando los límites de los tramos que vienen. */
  _velocidadDeseada(estado, veh, tp) {
    const geo = estado.geo;
    const P = estado.param;
    const primero = geo.tramos[veh.ruta[veh.tramo].id];
    let vDes = primero.tipo === 'puente' ? primero.vMax : Math.min(tp.velDeseada, primero.vMax);
    if (veh.carril === 'filtro' && veh.tramo === 0) vDes = Math.min(vDes, P.motos.velMaxFiltrado);
    for (let j = veh.tramo + 1; j < veh.ruta.length; j++) {
      const tr = veh.ruta[j];
      const dist = tr.d0 - veh.d;
      if (dist > 50) break;
      const lim = geo.tramos[tr.id].vMax;
      if (lim < vDes) vDes = Math.min(vDes, Math.sqrt(lim * lim + 2 * tp.decelComoda * Math.max(0, dist)));
    }
    return vDes;
  },

  /** Cuántos vehículos hay en el tramo de entrada `tramoId` delante de la posición d. */
  filaAdelante(estado, tramoId, d) {
    let n = 0;
    for (const e of estado.ocupacion[tramoId] || []) if (e.veh.d > d) n++;
    return n;
  },

  /** RF-04: decide qué motos pasan al carril de filtrado entre las filas detenidas. */
  _decidirFiltrado(estado, lideres) {
    const P = estado.param;
    if (!P.motos.filtrado) return;
    const geo = estado.geo;
    const ocup = estado.ocupacion;
    const umbral = P.metricas.umbralVelocidadCola;
    for (const veh of estado.vehiculos) {
      if (veh.tipo !== 'moto' || veh.tramo !== 0 || veh.autorizado || veh.carril === 'filtro' || veh.carril === 'ramal' || veh.puente) continue;
      const acc = geo.accesos[veh.acceso];
      if (!acc.filtro) continue;
      const linea = veh.ruta[0].largo;
      if (veh.d > linea - 1) continue;
      const lid = lideres.get(veh);
      if (!lid.veh || lid.veh.v >= umbral || lid.gap > P.motos.distanciaInicioFiltrado) continue;
      // ¿Hay algún carro o buseta detenido adelante en su carril? (si solo hay motos, no hace falta)
      let hayFila = false;
      for (const e of ocup[veh.ruta[0].id] || []) {
        if (e.veh.tipo !== 'moto' && e.veh.d > veh.d && e.veh.v < umbral) { hayFila = true; break; }
      }
      if (!hayFila) continue;
      // Solo se filtra si le conviene: la fila del filtro delante de ella es más corta que la de su carril.
      if (this.filaAdelante(estado, acc.filtro, veh.d) >= this.filaAdelante(estado, veh.ruta[0].id, veh.d)) continue;
      // ¿Cabe en el filtro sin tocar otra moto?
      const b = P.motos.brechaFiltrado;
      let libre = true;
      for (const e of ocup[acc.filtro] || []) {
        if (e.sT <= veh.d + b && e.sT + e.parte >= veh.d - veh.largo - b) { libre = false; break; }
      }
      if (!libre) continue;
      const carril = geo.tramos[veh.ruta[0].id];
      const filtro = geo.tramos[acc.filtro];
      const pc = Red.punto(carril, veh.d);
      const pf = Red.punto(filtro, veh.d);
      veh.ruta[0] = Object.assign({}, veh.ruta[0], { id: acc.filtro });
      veh.carril = 'filtro';
      veh.desfase = { x: pc.x - pf.x, y: pc.y - pf.y, tramo: 0, dIni: veh.d - veh.largo / 2, dist: 4 };
    }
  },

  paso(estado, dt) {
    const geo = estado.geo;
    const P = estado.param;
    const umbralCola = P.metricas.umbralVelocidadCola;

    const lideres = new Map();
    for (const veh of estado.vehiculos) lideres.set(veh, this.lider(estado, veh));
    this._decidirFiltrado(estado, lideres);

    // Pasada A: aceleraciones con la foto del instante anterior.
    const plan = new Map();
    for (const veh of estado.vehiculos) {
      const tp = P.vehiculos[veh.tipo];
      const lid = lideres.get(veh);
      let gap = lid.gap;
      let vLider = lid.veh ? lid.veh.v : 0;
      let tope = Infinity; // distancia que no se puede rebasar en este paso

      // Línea de ceda (solo si todavía está en el tramo de entrada y no tiene autorización).
      if (!veh.autorizado && veh.tramo === 0) {
        const linea = veh.ruta[0].largo;
        const gapLinea = linea - veh.d + tp.distMinima - 0.3;
        if (gapLinea < gap) { gap = gapLinea; vLider = 0; }
        tope = linea;
      }
      // Puntos de conflicto (solo nivel 1; el puente es el nivel 2 y nunca cede ni frena por la glorieta).
      // Último recurso contra trabas en círculo: tras DESTRABE_TOTAL s detenido dentro de la glorieta,
      // ignora los puntos de conflicto durante los siguientes metros (solo respeta a su líder).
      const suelo = (veh.nivel || 1) === 1 && !veh.puente;
      if (veh.tramo > 0 && suelo && (veh.tQuieto || 0) > Control.DESTRABE_TOTAL) veh.forzadoHasta = veh.d + 12;
      const forzado = veh.forzadoHasta != null && veh.d < veh.forzadoHasta;
      if (suelo && veh.autorizado && !forzado) {
        const parada = this._paradaConflicto(estado, veh, tp, lid);
        if (parada < Infinity) {
          const gapC = parada - veh.d + tp.distMinima - 0.3;
          if (gapC < gap) { gap = gapC; vLider = 0; }
          tope = Math.min(tope, Math.max(veh.d, parada));
        }
      }
      veh.a = this.idm(veh, tp, this._velocidadDeseada(estado, veh, tp), gap, vLider);
      plan.set(veh, { lid, tope });
    }

    // Pasada B: integrar aplicando restricciones duras (posiciones del líder del paso anterior).
    const quedan = [];
    for (const veh of estado.vehiculos) {
      const { lid, tope } = plan.get(veh);
      let vNueva = Math.max(0, veh.v + veh.a * dt);
      let dNueva = veh.d + Math.max(0, ((veh.v + vNueva) / 2) * dt);
      if (lid.veh) {
        const maxD = veh.d + lid.gap - this.HUECO_FISICO;
        if (dNueva > maxD) {
          dNueva = Math.max(veh.d, maxD);
          vNueva = Math.min(vNueva, lid.veh.v);
        }
      }
      if (dNueva > tope) {
        dNueva = Math.max(veh.d, tope);
        vNueva = 0;
      }
      veh.d = dNueva;
      veh.v = vNueva;
      veh.tQuieto = vNueva < 0.1 ? (veh.tQuieto || 0) + dt : 0; // tiempo que lleva detenido (s)

      // Cambio de tramo.
      while (veh.tramo < veh.ruta.length - 1 && veh.d >= veh.ruta[veh.tramo].d0 + veh.ruta[veh.tramo].largo) {
        if (veh.tramo === 0 && veh.carril === 'filtro') {
          // La moto sale del filtro hacia el conector de su carril: se dibuja deslizándose de lado.
          const fin = Red.punto(geo.tramos[veh.ruta[0].id], veh.ruta[0].largo);
          const ini = Red.punto(geo.tramos[veh.ruta[1].id], 0);
          veh.desfase = { x: fin.x - ini.x, y: fin.y - ini.y, tramo: 1, dIni: veh.ruta[1].d0, dist: 6 };
        }
        veh.tramo++;
      }

      if (!veh.puente && !veh.paso) {
        // Transiciones de estado.
        if (veh.t_cruce === null) {
          if (veh.tramo > 0) {
            veh.t_cruce = estado.t;
            veh.estado = 'cruzando';
            estado.crucesPaso.push(veh);
          } else if (veh.estado === 'aproximando' && veh.v < umbralCola) {
            veh.estado = 'en_cola';
            veh.t_entrada_cola = estado.t;
          }
        }
        if (veh.estado === 'cruzando' && geo.tramos[veh.ruta[veh.tramo].id].tipo === 'salida') veh.estado = 'alejandose';
      }

      const fin = veh.ruta[veh.ruta.length - 1];
      if (veh.d - veh.largo > fin.d0 + fin.largo) {
        veh.enRed = false;
        if (!veh.puente && !veh.paso) {
          veh.estado = 'salio';
          veh.t_salida = estado.t;
          estado.salidasPaso.push(veh);
        }
      } else {
        quedan.push(veh);
      }
    }
    estado.vehiculos = quedan;
  },
};
