/* =========================================================================
 * motor.js — Red vial de la glorieta y reloj de la simulación.
 *
 * geometria.json describe la Glorieta de La Lucha en % del lienzo (3:2,
 * 150 m × 100 m): (0, 0) arriba a la izquierda, (100, 100) abajo a la
 * derecha. Aquí se convierte todo a metros (mismo origen, y hacia abajo) y
 * se arma una RED DE TRAMOS (polilíneas):
 *   entrada (hasta la línea de ceda) → conector (curva) →
 *   anillo (elipse cerrada, 2 carriles, antihorario) → salida (curva) →
 *   cola de la salida (vía hacia afuera del lienzo).
 * Un acceso puede tener además un RAMAL de giro libre (p. ej. el corredor
 * inferior que sigue de largo hacia el Este rozando el anillo) que no pasa
 * por el anillo y cede al unirse a la salida de destino.
 * Cada vehículo recorre una RUTA (lista de tramos) y su posición es la
 * distancia `d` del frente medida sobre esa ruta. Donde dos tramos se
 * cruzan o se funden hay un PUNTO DE CONFLICTO (calculado aquí, a partir
 * de la geometría) que control.js usa para decidir quién cede.
 *
 * Niveles: la glorieta y sus accesos son el nivel 1 (suelo); las dos
 * calzadas del Puente Ruta 90 son el nivel 2. Entre niveles NO hay puntos
 * de conflicto: los vehículos del puente nunca ceden, frenan ni chocan con
 * los de abajo.
 *
 * Cada paso fijo de dt = 0.1 s ejecuta, en este orden estricto:
 *     1) llegadas   (llegadas.js)
 *     2) control    (control.js)
 *     3) movimiento (vehiculos.js)
 *     4) métricas   (metricas.js)
 *
 * El motor solo produce un objeto `estado` con números. No conoce el
 * canvas ni el DOM (por eso se puede correr "sin pantalla").
 * ========================================================================= */
'use strict';

/* ---------------------- Utilidades de polilíneas ---------------------- */
const Red = {
  mod(a, m) {
    return ((a % m) + m) % m;
  },

  rad(g) {
    return (g * Math.PI) / 180;
  },

  unitario(v) {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  },

  crearTramo(id, puntos, props) {
    const cum = this.largos(puntos);
    return Object.assign(
      { id, puntos, cum, largo: cum[cum.length - 1], cerrado: false, vMax: Infinity, rango: 0, nivel: 1, conflictos: [], predecesores: [] },
      props
    );
  },

  /** Distancias acumuladas de una polilínea. */
  largos(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  },

  /** Punto {x, y, ang} sobre un tramo en la posición s (fuera de los extremos extrapola). */
  punto(tramo, s) {
    const P = tramo.puntos;
    const c = tramo.cum;
    if (tramo.cerrado) s = this.mod(s, tramo.largo);
    let i;
    if (s <= 0) i = 0;
    else if (s >= tramo.largo) i = P.length - 2;
    else {
      let lo = 0;
      let hi = P.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (c[mid] <= s) lo = mid; else hi = mid;
      }
      i = lo;
    }
    const dx = P[i + 1][0] - P[i][0];
    const dy = P[i + 1][1] - P[i][1];
    const seg = c[i + 1] - c[i] || 1e-9;
    const f = (s - c[i]) / seg;
    return { x: P[i][0] + dx * f, y: P[i][1] + dy * f, ang: Math.atan2(dy, dx) };
  },

  /** Polilínea paralela a `pts`, desplazada `o` metros a la DERECHA del sentido de avance (y hacia abajo). */
  desplazar(pts, o) {
    return pts.map((q, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [q[0] - ((b[1] - a[1]) / l) * o, q[1] + ((b[0] - a[0]) / l) * o];
    });
  },

  bezier(p0, p1, p2, p3, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
    return pts;
  },

  /** Curva suave (Catmull-Rom) que pasa por todos los puntos. */
  catmullRom(pts, n) {
    const res = [pts[0]];
    const tan = (i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const f = i === 0 || i === pts.length - 1 ? 1 : 0.5;
      return [(b[0] - a[0]) * f, (b[1] - a[1]) * f];
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const m0 = tan(i), m1 = tan(i + 1);
      const p0 = pts[i], p3 = pts[i + 1];
      const seg = this.bezier(p0, [p0[0] + m0[0] / 3, p0[1] + m0[1] / 3], [p3[0] - m1[0] / 3, p3[1] - m1[1] / 3], p3, n);
      res.push(...seg.slice(1));
    }
    return res;
  },

  /** Remuestrea una polilínea para que ningún segmento supere `paso` m. */
  densificar(pts, paso = 1) {
    const res = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-6) continue;
      const n = Math.max(1, Math.ceil(l / paso));
      for (let j = 1; j <= n; j++) res.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
    }
    return res;
  },

  /** Sub-polilínea entre las distancias s0 y s1 (medidas desde el inicio). */
  recortar(pts, s0, s1) {
    const cum = this.largos(pts);
    const L = cum[cum.length - 1];
    s0 = Math.max(0, s0);
    s1 = Math.min(L, s1);
    const en = (s) => {
      let i = 0;
      while (i < pts.length - 2 && cum[i + 1] < s) i++;
      const f = (s - cum[i]) / (cum[i + 1] - cum[i] || 1e-9);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
    };
    const res = [en(s0)];
    for (let i = 0; i < pts.length; i++) if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) res.push(pts[i]);
    res.push(en(s1));
    return res;
  },

  /** Distancia s (desde el inicio) del punto de la polilínea más cercano a p. */
  masCercano(pts, p) {
    const cum = this.largos(pts);
    let mejor = Infinity, sMejor = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      const d = Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
      if (d < mejor) { mejor = d; sMejor = cum[i] + t * (cum[i + 1] - cum[i]); }
    }
    return sMejor;
  },

  /** Dirección (unitaria) al inicio y al final de una polilínea (mirando unos metros). */
  dirInicio(pts) {
    const b = pts[Math.min(pts.length - 1, 3)];
    return this.unitario([b[0] - pts[0][0], b[1] - pts[0][1]]);
  },
  dirFin(pts) {
    const n = pts.length - 1;
    const a = pts[Math.max(0, n - 3)];
    return this.unitario([pts[n][0] - a[0], pts[n][1] - a[1]]);
  },

  /** Cruces entre dos polilíneas: lista de [sA, sB]. */
  intersecciones(A, B) {
    const res = [];
    const PA = A.puntos, PB = B.puntos;
    for (let i = 0; i < PA.length - 1; i++) {
      const a0 = PA[i], a1 = PA[i + 1];
      for (let j = 0; j < PB.length - 1; j++) {
        const b0 = PB[j], b1 = PB[j + 1];
        const rx = a1[0] - a0[0], ry = a1[1] - a0[1];
        const sx = b1[0] - b0[0], sy = b1[1] - b0[1];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const qx = b0[0] - a0[0], qy = b0[1] - a0[1];
        const t = (qx * sy - qy * sx) / den;
        const u = (qx * ry - qy * rx) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        const sA = A.cum[i] + t * (A.cum[i + 1] - A.cum[i]);
        const sB = B.cum[j] + u * (B.cum[j + 1] - B.cum[j]);
        if (!res.some((r) => Math.abs(r[0] - sA) < 1 && Math.abs(r[1] - sB) < 1)) res.push([sA, sB]);
      }
    }
    return res;
  },

  /** ¿El intervalo [sT, sT+parte] de un tramo toca la zona [a, b]? (circular si el tramo es cerrado) */
  solapa(tramo, sT, parte, a, b) {
    if (!tramo.cerrado) return sT <= b && sT + parte >= a;
    const C = tramo.largo;
    const x = this.mod(sT - a, C);
    return x <= b - a || x + parte >= C;
  },

  /** Ocupación: para cada tramo, los pedazos de vehículos que hay sobre él. */
  ocupacion(estado) {
    const ocup = {};
    for (const veh of estado.vehiculos) {
      const dF = veh.d;
      const dT = veh.d - veh.largo;
      for (let i = veh.tramo; i >= 0; i--) {
        const tr = veh.ruta[i];
        const a = i === 0 ? dT : Math.max(dT, tr.d0);
        const b = Math.min(dF, tr.d0 + tr.largo);
        if (b >= a) {
          (ocup[tr.id] || (ocup[tr.id] = [])).push({ veh, sT: tr.s0 + (a - tr.d0), parte: b - a });
        }
        if (dT >= tr.d0) break;
      }
    }
    return ocup;
  },

  /** Distancia que le falta al frente de `veh` para llegar a (tramoId, s) de su ruta; null si no pasa por ahí. */
  distanciaA(geo, veh, tramoId, s) {
    for (let i = veh.tramo; i < veh.ruta.length; i++) {
      const tr = veh.ruta[i];
      if (tr.id !== tramoId) continue;
      const t = geo.tramos[tramoId];
      let delta = s - tr.s0;
      if (t.cerrado) delta = this.mod(delta, t.largo);
      if (delta < -1e-6 || delta > tr.largo + 1e-6) continue;
      const D = tr.d0 + delta;
      if (D >= veh.d - 1e-6) return D - veh.d;
    }
    return null;
  },

  /** Índice del tramo de la ruta que contiene la distancia d (0 si d < 0). */
  indiceTramo(ruta, d) {
    let i = 0;
    while (i < ruta.length - 1 && d >= ruta[i].d0 + ruta[i].largo) i++;
    return i;
  },
};

/* ------------------------------- Motor ------------------------------- */
const Motor = {
  /** Copia profunda simple (los datos son JSON puro). */
  clonar(obj) {
    return JSON.parse(JSON.stringify(obj));
  },

  /** Construye la red de tramos (en metros) a partir de geometria.json (en % del lienzo). */
  derivarGeometria(g) {
    const W = g.lienzo.ancho;
    const H = g.lienzo.alto;
    const aM = (p) => [(p[0] * W) / 100, (p[1] * H) / 100]; // % del lienzo → metros
    const an = g.anillo;
    const C = aM(an.centro);
    const A = ((an.derecha - an.izquierda) * W) / 200; // semieje horizontal del borde exterior (m)
    const B = ((an.abajo - an.arriba) * H) / 200;      // semieje vertical
    const wA = an.anchoCarril;
    const nAn = an.carriles;
    const bA = an.berma;
    const w = g.anchoCarril;
    const vel = g.velocidadesMax;
    const ext = g.extension ?? 12;
    const dCeda = g.distanciaCeda ?? 3;
    const dSal = g.distanciaSalida ?? 3;

    // Anillo elíptico: cada "inset" es la distancia hacia adentro desde el borde exterior.
    const insetCarril = (k) => bA + wA * (nAn - 1 - k + 0.5); // k = 0 interno ... nAn-1 externo
    const insetInterno = 2 * bA + wA * nAn;                     // borde interior de la calzada del anillo
    const elipse = (inset, th) => {
      const t = Red.rad(th);
      return [C[0] + (A - inset) * Math.cos(t), C[1] - (B - inset) * Math.sin(t)];
    };
    const tangente = (inset, th) => {
      const t = Red.rad(th);
      return Red.unitario([-(A - inset) * Math.sin(t), -(B - inset) * Math.cos(t)]); // sentido antihorario
    };
    const theta = (p) => Red.mod((Math.atan2(-(p[1] - C[1]) / B, (p[0] - C[0]) / A) * 180) / Math.PI, 360);
    /** Distancia (m, aprox. radial) de p al borde exterior del anillo; negativa si está adentro. */
    const fuera = (p) => {
      const dx = p[0] - C[0], dy = p[1] - C[1];
      const f = Math.atan2(dy, dx);
      return Math.hypot(dx, dy) - 1 / Math.hypot(Math.cos(f) / A, Math.sin(f) / B);
    };

    const geo = {
      fuente: g,
      W, H, aM,
      centro: C, semiA: A, semiB: B,
      anchoCarril: w,
      anchoCarrilAnillo: wA,
      berma: g.berma,
      bermaAnillo: bA,
      anchoAnden: g.anchoAnden,
      sobreancho: an.sobreancho,
      nAnillo: nAn,
      insetCarril, insetInterno, elipse, tangente, theta, fuera,
      tramos: {},
      accesos: {},
      entradas: [],
      salidas: [],
      conflictos: [],
      puente: null,
    };
    const agregar = (t) => (geo.tramos[t.id] = t);

    // ---- Curvas de geometria.json (en %) → polilíneas en metros ----
    const pieza = (pz, prev) => {
      if (pz.linea) return (prev ? [prev] : []).concat(pz.linea.map(aM)); // continúa desde el punto anterior
      if (pz.bezier) {
        const [p0, c1, c2, p3] = pz.bezier.map(aM);
        return Red.bezier(p0, c1, c2, p3, 48);
      }
      if (pz.spline) return Red.catmullRom(pz.spline.map(aM), 16);
      if (pz.arcoAnillo) {
        const a = pz.arcoAnillo;
        const n = Math.max(2, Math.ceil(Math.abs(a.hasta - a.desde) / 1.5));
        return Array.from({ length: n + 1 }, (_, i) => elipse(-(a.fuera || 0), a.desde + ((a.hasta - a.desde) * i) / n));
      }
      if (pz.haciaAnillo) {
        // Bézier desde un punto hasta el anillo, llegando tangente al sentido de giro.
        const h = pz.haciaAnillo;
        const P0 = h.desde ? aM(h.desde) : prev;
        const M = elipse(-(h.fuera || 0), h.theta);
        const T = tangente(-(h.fuera || 0), h.theta);
        const d = Math.hypot(M[0] - P0[0], M[1] - P0[1]);
        const [f0, f1] = h.fuerza || [0.35, 0.4];
        const d0 = h.dirInicio ? Red.unitario([(h.dirInicio[0] * W) / 100, (h.dirInicio[1] * H) / 100]) : Red.unitario([M[0] - P0[0], M[1] - P0[1]]);
        return Red.bezier(P0, [P0[0] + d0[0] * f0 * d, P0[1] + d0[1] * f0 * d], [M[0] - T[0] * f1 * d, M[1] - T[1] * f1 * d], M, 48);
      }
      if (pz.desdeAnillo) {
        // Bézier que se despega tangente del anillo hasta un punto (con dirección final opcional).
        const h = pz.desdeAnillo;
        const P0 = elipse(-(h.fuera || 0), h.theta);
        const T = tangente(-(h.fuera || 0), h.theta);
        const P3 = aM(h.hasta);
        const d = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
        const [f0, f1] = h.fuerza || [0.4, 0.35];
        const d3 = h.dirFinal ? Red.unitario([(h.dirFinal[0] * W) / 100, (h.dirFinal[1] * H) / 100]) : Red.unitario([P3[0] - P0[0], P3[1] - P0[1]]);
        return Red.bezier(P0, [P0[0] + T[0] * f0 * d, P0[1] + T[1] * f0 * d], [P3[0] - d3[0] * f1 * d, P3[1] - d3[1] * f1 * d], P3, 64);
      }
      throw new Error('Pieza de curva desconocida: ' + JSON.stringify(pz));
    };
    const cacheCurvas = {};
    const curva = (nombre) => {
      if (cacheCurvas[nombre]) return cacheCurvas[nombre];
      const def = g.curvas[nombre];
      if (!def) throw new Error('Curva desconocida en geometria.json: ' + nombre);
      let pts = [];
      for (const pz of def) {
        const nuevos = pieza(pz, pts[pts.length - 1]);
        pts = pts.concat(pts.length ? nuevos.slice(1) : nuevos);
      }
      return (cacheCurvas[nombre] = Red.densificar(pts, 0.8));
    };
    geo.curva = curva;
    /** Carril: curva base desplazada (m a la derecha de su sentido de definición) y, si se pide, invertida. */
    const carril = (def) => {
      let pts = curva(def.curva);
      if (def.desplazamiento) pts = Red.desplazar(pts, def.desplazamiento);
      if (def.invertir) pts = pts.slice().reverse();
      return pts;
    };
    const extenderInicio = (pts, e) => {
      const d = Red.dirInicio(pts);
      return [[pts[0][0] - d[0] * e, pts[0][1] - d[1] * e], ...pts];
    };
    const extenderFin = (pts, e) => {
      const d = Red.dirFin(pts);
      const n = pts[pts.length - 1];
      return [...pts, [n[0] + d[0] * e, n[1] + d[1] * e]];
    };
    /** s donde un carril de entrada llega a `dCeda` m del borde del anillo (primera vez). */
    const sCeda = (pts) => {
      const cum = Red.largos(pts);
      for (let i = 1; i < pts.length; i++) {
        const f1 = fuera(pts[i]);
        if (f1 < dCeda) {
          const f0 = fuera(pts[i - 1]);
          return cum[i - 1] + (cum[i] - cum[i - 1]) * Math.max(0, Math.min(1, (f0 - dCeda) / (f0 - f1 || 1e-9)));
        }
      }
      return cum[cum.length - 1];
    };
    /** s desde donde un carril de salida ya queda a `dSal` m del borde del anillo (última vez). */
    const sSalida = (pts) => {
      const cum = Red.largos(pts);
      for (let i = pts.length - 2; i >= 0; i--) {
        const f0 = fuera(pts[i]);
        if (f0 < dSal) {
          const f1 = fuera(pts[i + 1]);
          return cum[i] + (cum[i + 1] - cum[i]) * Math.max(0, Math.min(1, (dSal - f0) / (f1 - f0 || 1e-9)));
        }
      }
      return 0;
    };

    // ---- Anillo: una elipse cerrada por carril; s crece en sentido antihorario desde las 3:00 ----
    const N = 720;
    for (let k = 0; k < nAn; k++) {
      const pts = [];
      for (let i = 0; i <= N; i++) pts.push(elipse(insetCarril(k), (360 * i) / N));
      agregar(Red.crearTramo('anillo_' + k, pts, { tipo: 'anillo', cerrado: true, carril: k, vMax: vel.anillo, rango: 3 }));
    }
    const sAnillo = (k, th) => {
      const t = geo.tramos['anillo_' + k];
      const f = (Red.mod(th, 360) / 360) * N;
      const i = Math.min(N - 1, Math.floor(f));
      return t.cum[i] + (t.cum[i + 1] - t.cum[i]) * (f - i);
    };
    const carrilAnillo = (j, n) => Math.min(nAn - 1, Math.max(0, j + (nAn - n)));
    const todos = Array.from({ length: nAn }, (_, i) => i);

    for (const a of g.accesos) {
      const angE = Object.assign({}, g.anguloEntrada, a.anguloEntrada);
      const angS = Object.assign({}, g.anguloSalida, a.anguloSalida);
      const acc = {
        id: a.id, nombre: a.nombre, etiquetas: a.etiquetas || [a.nombre],
        posEtiqueta: a.posEtiqueta ? aM(a.posEtiqueta) : null,
        carrilesEntrada: [], carrilesSalida: [], filtro: null, ramal: null, cola: null,
      };
      geo.accesos[a.id] = acc;
      const ents = a.entradas || [];
      const nE = ents.length;
      if (nE > 0) geo.entradas.push(a.id);
      if (a.salida) geo.salidas.push(a.id);

      // Entradas: carril hasta la línea de ceda + conector curvo hasta el carril del anillo.
      // Con un solo carril de entrada hay un conector a CADA carril del anillo (cada vehículo toma el
      // que le sirve según su destino). j = 0 es el carril izquierdo del conductor (va al anillo interno).
      const largosCeda = [];
      ents.forEach((def, j) => {
        let pts = carril(def);
        const sc = sCeda(pts);
        largosCeda.push(sc);
        pts = extenderInicio(Red.recortar(pts, 0, sc), ext);
        const ent = agregar(Red.crearTramo(`ent_${a.id}_${j}`, pts, { tipo: 'entrada', acceso: a.id, carril: j }));
        const Y = pts[pts.length - 1];
        const dY = Red.dirFin(pts);
        const thY = theta(Y);
        const ks = nE === 1 ? todos : [carrilAnillo(j, nE)];
        for (const k of ks) {
          const th = thY + (k === nAn - 1 ? angE.externo : angE.interno);
          const M = elipse(insetCarril(k), th);
          const T = tangente(insetCarril(k), th);
          const c = 0.45 * Math.hypot(M[0] - Y[0], M[1] - Y[1]);
          const bz = Red.bezier(Y, [Y[0] + dY[0] * c, Y[1] + dY[1] * c], [M[0] - T[0] * c, M[1] - T[1] * c], M, 24);
          const con = agregar(Red.crearTramo(ks.length > 1 ? `con_${a.id}_${j}_${k}` : `con_${a.id}_${j}`, bz, {
            tipo: 'conector', acceso: a.id, carril: j, anillo: k, sFusion: sAnillo(k, th), psi: Red.mod(th, 360),
            vMax: vel.conector, rango: 1, predecesores: [ent.id],
          }));
          acc.carrilesEntrada.push({ entrada: ent.id, conector: con.id, anillo: k });
          // Fusión: la zona cubre los últimos metros del conector y del anillo antes del punto de entrada.
          geo.conflictos.push({ A: con.id, sA: con.largo - 3, B: 'anillo_' + k, sB: Red.mod(con.sFusion - 3, geo.tramos['anillo_' + k].largo), tipo: 'fusion' });
        }
        // Conectores "hermanos" (mismo carril de entrada): al principio casi se superponen.
        const hs = acc.carrilesEntrada.filter((c) => c.entrada === ent.id).map((c) => c.conector);
        for (const id of hs) geo.tramos[id].hermanos = hs.filter((x) => x !== id);
      });
      // Carril virtual de filtrado de motos (RF-04): entre los dos carriles de entrada.
      if (nE >= 2 && ents[0].curva === ents[1].curva) {
        const def = Object.assign({}, ents[0], { desplazamiento: ((ents[0].desplazamiento || 0) + (ents[1].desplazamiento || 0)) / 2 });
        const pts = extenderInicio(Red.recortar(carril(def), 0, Math.min(...largosCeda)), ext);
        const fil = agregar(Red.crearTramo(`filtro_${a.id}`, pts, { tipo: 'filtro', acceso: a.id }));
        acc.filtro = fil.id;
        for (const ce of acc.carrilesEntrada) geo.tramos[ce.conector].predecesores.push(fil.id);
      }

      // Salida: una curva desde cada carril del anillo que la usa hasta el punto J donde empieza la
      // cola de la salida (un solo carril hacia afuera). Las curvas se funden en J.
      if (a.salida) {
        const def = a.salida;
        let pts = carril(def);
        const s0 = def.inicio ? Red.masCercano(pts, aM(def.inicio)) : sSalida(pts);
        pts = extenderFin(Red.recortar(pts, s0, Infinity), ext);
        const cola = agregar(Red.crearTramo(`cola_${a.id}`, pts, { tipo: 'salida', acceso: a.id, vMax: vel.salida, rango: 3.5, cola: true }));
        acc.cola = cola.id;
        const J = pts[0];
        const dJ = Red.dirInicio(pts);
        const thJ = theta(J);
        const sals = [];
        for (const k of def.desdeCarriles || todos) {
          const th = thJ - (k === nAn - 1 ? angS.externo : angS.interno);
          const D = elipse(insetCarril(k), th);
          const T = tangente(insetCarril(k), th);
          const c = 0.45 * Math.hypot(J[0] - D[0], J[1] - D[1]);
          const bz = Red.bezier(D, [D[0] + T[0] * c, D[1] + T[1] * c], [J[0] - dJ[0] * c, J[1] - dJ[1] * c], J, 24);
          const sal = agregar(Red.crearTramo(`sal_${a.id}_${k}`, bz, {
            tipo: 'salida', acceso: a.id, anillo: k, sDiverge: sAnillo(k, th), psi: Red.mod(th, 360),
            vMax: vel.salida, rango: 3.5, salida: cola.id,
          }));
          sals.push(sal);
          acc.carrilesSalida.push({ salida: sal.id, anillo: k, cola: cola.id });
          // Divergencia: los primeros metros de la salida aún pisan el carril del anillo.
          geo.conflictos.push({ A: sal.id, sA: 4, B: 'anillo_' + k, sB: Red.mod(sal.sDiverge + 4, geo.tramos['anillo_' + k].largo), tipo: 'divergencia' });
        }
        for (let i = 0; i < sals.length; i++) {
          for (let j = i + 1; j < sals.length; j++) {
            geo.conflictos.push({ A: sals[i].id, sA: sals[i].largo - 3, B: sals[j].id, sB: sals[j].largo - 3, tipo: 'fusion' });
          }
        }
      }
    }

    // Ramales de giro libre: siguen su propia curva sin pasar por el anillo y se funden (cediendo el
    // paso) en el punto J donde empieza la cola de la salida de destino.
    for (const a of g.accesos) {
      const rm = a.ramal;
      const acc = geo.accesos[a.id];
      const dest = rm && geo.accesos[rm.hacia];
      if (!dest || !dest.cola || acc.carrilesEntrada.length === 0) continue;
      const pts = extenderInicio(carril(rm), ext);
      const J = geo.tramos[dest.cola].puntos[0];
      const sJ = Red.masCercano(pts, J);
      let ent, tIni;
      if (rm.compartirEntrada != null) {
        // Un solo carril (como el corredor inferior): el ramal comparte el carril de entrada hasta la línea
        // de ceda y ahí se separa; quien va al anillo dobla por el conector y quien sigue, por el ramal.
        ent = geo.tramos[`ent_${a.id}_${rm.compartirEntrada}`];
        tIni = ent.largo;
      } else {
        tIni = rm.inicio ?? 15;
        ent = agregar(Red.crearTramo(`ent_${a.id}_ramal`, Red.recortar(pts, 0, tIni), { tipo: 'entrada', acceso: a.id, carril: 'ramal' }));
      }
      const rpts = Red.recortar(pts, tIni, sJ);
      rpts[rpts.length - 1] = J.slice();
      const ram = agregar(Red.crearTramo(`ramal_${a.id}`, rpts, {
        tipo: 'ramal', acceso: a.id, hacia: rm.hacia, salida: dest.cola, sUnion: 0,
        vMax: vel.ramal ?? vel.conector, rango: 1, predecesores: [ent.id],
      }));
      acc.ramal = { entrada: ent.id, ramal: ram.id, salida: dest.cola, sUnion: 0, hacia: rm.hacia, compartido: rm.compartirEntrada != null };
      if (acc.ramal.compartido) {
        // Ramal y conectores salen del mismo punto: en sus primeros metros se ven como "hermanos".
        const grupo = acc.carrilesEntrada.filter((c) => c.entrada === ent.id).map((c) => c.conector).concat(ram.id);
        for (const id of grupo) geo.tramos[id].hermanos = grupo.filter((x) => x !== id);
      }
      for (const cs of dest.carrilesSalida) {
        const sal = geo.tramos[cs.salida];
        geo.conflictos.push({ A: ram.id, sA: ram.largo - 3, B: sal.id, sB: sal.largo - 3, tipo: 'fusion' });
      }
    }

    // Cruces geométricos entre conectores, ramales, salidas y anillo (solo nivel 1, no entre tramos encadenados).
    const ids = Object.keys(geo.tramos).filter((id) => ['conector', 'ramal', 'salida', 'anillo'].includes(geo.tramos[id].tipo));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const A = geo.tramos[ids[i]];
        const B = geo.tramos[ids[j]];
        if (A.nivel !== B.nivel) continue;
        if (A.tipo === 'anillo' && B.tipo === 'anillo') continue;
        const encadenado = (x, y) => x.tipo !== 'anillo' && y.tipo === 'anillo' && x.anillo === y.carril;
        if (encadenado(A, B) || encadenado(B, A)) continue;
        if (A.salida === B.id || B.salida === A.id) continue; // curva y su cola (o ramal y su cola)
        const hermanos = ['conector', 'ramal'].includes(A.tipo) && ['conector', 'ramal'].includes(B.tipo) && A.predecesores[0] === B.predecesores[0];
        const mismoFin = A.salida && A.salida === B.salida; // se funden en el mismo punto J: ahí manda la fusión
        for (const [sA, sB] of Red.intersecciones(A, B)) {
          if (hermanos && sA < 1 && sB < 1) continue;
          if (mismoFin && sA > A.largo - 1.5 && sB > B.largo - 1.5) continue;
          geo.conflictos.push({ A: A.id, sA, B: B.id, sB, tipo: 'cruce' });
        }
      }
    }
    geo.conflictos.forEach((c, i) => {
      c.id = i;
      c.w = { fusion: 3.0, divergencia: 4.0, cruce: 2.6 }[c.tipo]; // media longitud de la zona de conflicto (m)
      geo.tramos[c.A].conflictos.push({ id: i, s: c.sA, otro: c.B, sOtro: c.sB, w: c.w, tipo: c.tipo });
      geo.tramos[c.B].conflictos.push({ id: i, s: c.sB, otro: c.A, sOtro: c.sA, w: c.w, tipo: c.tipo });
    });

    // ---- Puente Ruta 90 (nivel 2): dos calzadas separadas, cada una de un solo sentido ----
    const p = g.puente;
    if (p) {
      const n = p.carrilesPorSentido;
      const semi = (p.anchoCarril * n) / 2 + p.baranda;
      const calzadas = [];
      const carriles = [];
      for (const cz of p.calzadas) {
        // Los puntos vienen en el sentido de marcha; se extiende más allá del lienzo por ambos lados.
        const eje = extenderFin(extenderInicio(Red.densificar(Red.catmullRom(cz.puntos.map(aM), 16), 1), ext + 4), ext + 4);
        const linea = Red.crearTramo('eje_' + cz.id, eje, { tipo: 'eje', nivel: p.nivel ?? 2 });
        for (let j = 0; j < n; j++) {
          const o = p.anchoCarril * (j + 0.5 - n / 2);
          const t = agregar(Red.crearTramo(`puente_${cz.id}_${j}`, Red.desplazar(eje, o), { tipo: 'puente', nivel: p.nivel ?? 2, vMax: vel.puente, calzada: cz.id }));
          carriles.push(t.id);
        }
        calzadas.push({ id: cz.id, nombre: cz.nombre, eje: linea });
      }
      geo.puente = { fuente: p, calzadas, carriles, semiAncho: semi };
    }

    // ---- Superficies de calzada (solo para dibujar) y árboles ----
    geo.superficies = (g.superficies || []).map((s) => {
      let pts = [];
      for (const it of s.contorno) {
        if (it.punto) pts.push(aM(it.punto));
        else if (it.curva) pts = pts.concat(curva(it.curva));
        else if (it.curvaInvertida) pts = pts.concat(curva(it.curvaInvertida).slice().reverse());
      }
      return { nombre: s.nombre, pts };
    });
    geo.arboles = (g.arboles || []).map(aM);
    return geo;
  },

  /** Ruta (lista de tramos con distancias acumuladas) de un acceso de entrada a uno de salida. */
  crearRuta(geo, origen, destino) {
    const ao = geo.accesos[origen];
    const ad = geo.accesos[destino];
    if (ao.ramal && ao.ramal.hacia === destino) {
      // Giro libre por el ramal: entrada del ramal → curva → cola de la salida desde el punto de unión.
      const rm = ao.ramal;
      const cola = geo.tramos[rm.salida];
      return this._ruta([
        { id: rm.entrada, s0: 0, largo: geo.tramos[rm.entrada].largo },
        { id: rm.ramal, s0: 0, largo: geo.tramos[rm.ramal].largo },
        { id: cola.id, s0: rm.sUnion, largo: cola.largo - rm.sUnion },
      ]);
    }
    // Regla de carril: salidas hasta media vuelta por el carril externo, las demás por el interno.
    const externo = geo.nAnillo - 1;
    const ceE = ao.carrilesEntrada.find((c) => c.anillo === externo) || ao.carrilesEntrada[0];
    const csE = ad.carrilesSalida.find((c) => c.anillo === externo) || ad.carrilesSalida[0];
    let giro = Red.mod(geo.tramos[csE.salida].psi - geo.tramos[ceE.conector].psi, 360);
    if (giro < 1) giro = 360;
    const kDeseado = giro <= 180 ? externo : 0;
    const comunes = ao.carrilesEntrada.map((c) => c.anillo).filter((k) => ad.carrilesSalida.some((s) => s.anillo === k));
    const k = comunes.includes(kDeseado) ? kDeseado : comunes[comunes.length - 1];
    const ce = ao.carrilesEntrada.find((c) => c.anillo === k);
    const cs = ad.carrilesSalida.find((c) => c.anillo === k);
    const ent = geo.tramos[ce.entrada];
    const con = geo.tramos[ce.conector];
    const anillo = geo.tramos['anillo_' + k];
    const sal = geo.tramos[cs.salida];
    const cola = geo.tramos[cs.cola];
    let arco = Red.mod(sal.sDiverge - con.sFusion, anillo.largo);
    if (arco < 3) arco += anillo.largo;
    return this._ruta([
      { id: ent.id, s0: 0, largo: ent.largo },
      { id: con.id, s0: 0, largo: con.largo },
      { id: anillo.id, s0: con.sFusion, largo: arco },
      { id: sal.id, s0: 0, largo: sal.largo },
      { id: cola.id, s0: 0, largo: cola.largo },
    ]);
  },

  _ruta(tramos) {
    let d0 = 0;
    for (const t of tramos) {
      t.d0 = d0;
      d0 += t.largo;
    }
    return tramos;
  },

  /** Posición en el mundo (m) del centro de un vehículo y su ángulo. */
  posicionMundo(geo, veh) {
    const dc = veh.d - veh.largo / 2;
    const i = Red.indiceTramo(veh.ruta, dc);
    const tr = veh.ruta[i];
    const p = Red.punto(geo.tramos[tr.id], tr.s0 + (dc - tr.d0));
    if (veh.desfase && i >= veh.desfase.tramo) {
      const f = 1 - (dc - veh.desfase.dIni) / veh.desfase.dist;
      if (f > 0) {
        const k = Math.min(1, f);
        p.x += veh.desfase.x * k;
        p.y += veh.desfase.y * k;
      }
    }
    return { x: p.x, y: p.y, angulo: p.ang };
  },

  /**
   * Crea un estado nuevo.
   * datos = { geometria, conteos, parametros }; opciones = { semilla, modo, perfil }
   */
  crear(datos, opciones = {}) {
    const param = this.clonar(datos.parametros);
    const conteos = this.clonar(datos.conteos);
    const geo = this.derivarGeometria(datos.geometria);
    const semilla = opciones.semilla ?? param.simulacion.semilla;
    const perfil = opciones.perfil && conteos.perfiles[opciones.perfil] ? opciones.perfil : conteos.perfilActivo;

    const estado = {
      t: 0,
      paso: 0,
      dt: param.simulacion.dt,
      semilla,
      perfil,
      geo,
      param,
      conteos,
      vehiculos: [],
      pendientes: Object.fromEntries(geo.entradas.map((id) => [id, []])),
      siguienteId: 1,
      crucesPaso: [],
      salidasPaso: [],
      ocupacion: {},
    };
    estado.llegadas = Llegadas.crear(estado, semilla);
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

    Llegadas.paso(estado, estado.dt);             // 1) llegadas
    estado.ocupacion = Red.ocupacion(estado);     //    (quién ocupa cada tramo, foto del instante)
    Control.paso(estado, estado.dt);              // 2) control
    Vehiculos.paso(estado, estado.dt);            // 3) movimiento
    Metricas.paso(estado);                        // 4) métricas
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
  correrSinPantalla(datos, modo, semilla, minutos, perfil) {
    const estado = this.crear(datos, { semilla, modo, perfil });
    this.avanzar(estado, minutos * 60);
    return Metricas.resumen(estado);
  },
};
