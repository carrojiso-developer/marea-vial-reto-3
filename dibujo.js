/* =========================================================================
 * dibujo.js — Renderizado 2D en <canvas> de la Glorieta de La Lucha.
 *
 * Solo LEE el estado que produce el motor y lo pinta. Nunca modifica el
 * estado. El lienzo es 3:2 y todo se dibuja en metros con el origen en la
 * esquina superior izquierda (la transformación del contexto escala
 * metros → píxeles); geometria.json está en % del lienzo y motor.js ya lo
 * convirtió a metros.
 *
 * Orden estricto de capas (Z-order):
 *   1) Fondo verde + todas las calzadas del nivel inferior (anillo, Carrera 15,
 *      Carrera 15 Sur, Calle 40, corredor inferior–este, ramales e isletas),
 *      marcas viales y señales.
 *   2) Vehículos del nivel inferior (nivel 1) y agentes de tránsito.
 *   3) Sombra proyectada y tableros OPACOS de las dos calzadas del Puente
 *      Ruta 90 (tapan a los vehículos de abajo en los cruces de 7:30, 6:30,
 *      2:30 y 3:00).
 *   4) Vehículos del puente (nivel 2).
 *   Después, en píxeles: rótulos y reloj.
 * ========================================================================= */
'use strict';

const Dibujo = {
  COLORES: {
    fondo: '#b9d3a8',
    anden: '#d8d2c4',
    via: '#4a4d52',
    sobreancho: '#8d8a82',
    isla: '#7fb069',
    islaBorde: '#efeadc',
    arbol: '#4f8a3c',
    lineaCentral: '#f2c230',
    lineaBlanca: '#f4f4f4',
    moto: '#f08a24',
    carro: '#3b6fd8',
    buseta: '#1f9d6b',
    contorno: 'rgba(0,0,0,0.55)',
    enCola: '#d93a3a',
    verde: '#2fd15a',
    amarillo: '#ffc928',
    rojo: '#ff4040',
    apagado: '#2b2b2b',
    texto: '#1d2125',
    puente: '#5b5e64',
    puenteBorde: '#e8e6e0',
    puenteFilo: '#2a2c30',
    agente: '#1b3a8a',
  },

  crear(canvas) {
    return { canvas, ctx: canvas.getContext('2d'), dpr: 1, ancho: 0, alto: 0, escala: 1 };
  },

  /** Ajusta la resolución interna del canvas a su tamaño en pantalla (proporción del lienzo de geometria.json). */
  ajustar(r, geo) {
    const dpr = window.devicePixelRatio || 1;
    const ancho = Math.max(240, Math.floor(r.canvas.clientWidth));
    const alto = Math.round((ancho * geo.H) / geo.W);
    if (ancho !== r.ancho || alto !== r.alto || dpr !== r.dpr) {
      r.canvas.width = ancho * dpr;
      r.canvas.height = alto * dpr;
      r.ancho = ancho;
      r.alto = alto;
      r.dpr = dpr;
    }
    r.escala = ancho / geo.W; // píxeles CSS por metro
  },

  dibujar(r, estado) {
    const geo = estado.geo;
    this.ajustar(r, geo);
    const ctx = r.ctx;
    const k = r.escala * r.dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.COLORES.fondo;
    ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);

    // A partir de aquí se dibuja en metros (origen arriba a la izquierda).
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // Capa 1: suelo.
    this._suelo(ctx, geo);
    this._senales(ctx, estado);
    // Capa 2: vehículos del nivel inferior.
    for (const veh of estado.vehiculos) if ((veh.nivel || 1) === 1 && !veh.puente) this._vehiculo(ctx, geo, veh);
    this._agentes(ctx, estado);
    // Capa 3: puente opaco (con sombra) por encima de todo lo del suelo.
    this._puente(ctx, geo);
    // Capa 4: vehículos del puente.
    for (const veh of estado.vehiculos) if (veh.puente || veh.nivel === 2) this._vehiculo(ctx, geo, veh);

    // Textos en píxeles.
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    this._etiquetas(ctx, r, estado);
  },

  /* ----------------------------- Utilidades ----------------------------- */

  _poligono(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  },

  _trazo(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  },

  _linea(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  },

  _circulo(ctx, x, y, radio) {
    ctx.beginPath();
    ctx.arc(x, y, radio, 0, Math.PI * 2);
  },

  /** Elipse del anillo a `inset` m hacia adentro de su borde exterior (negativo = hacia afuera). */
  _elipse(ctx, geo, inset) {
    ctx.beginPath();
    ctx.ellipse(geo.centro[0], geo.centro[1], Math.max(0.1, geo.semiA - inset), Math.max(0.1, geo.semiB - inset), 0, 0, Math.PI * 2);
  },

  /** Flecha de sentido (triángulo) en (x, y) apuntando al ángulo `ang`. */
  _flecha(ctx, x, y, ang, largo = 1.7, ancho = 0.75) {
    const tx = Math.cos(ang), ty = Math.sin(ang);
    const nx = -ty, ny = tx;
    this._poligono(ctx, [
      [x + tx * largo, y + ty * largo],
      [x - tx * largo * 0.5 + nx * ancho, y - ty * largo * 0.5 + ny * ancho],
      [x - tx * largo * 0.5 - nx * ancho, y - ty * largo * 0.5 - ny * ancho],
    ]);
    ctx.fill();
  },

  /* ----------------------------- Capa 1: suelo ----------------------------- */

  /** Tramos de calzada del nivel inferior que se pintan como franjas (todo menos el anillo y el filtro). */
  _trazosSuelo(geo) {
    if (!geo._trazosSuelo) {
      geo._trazosSuelo = Object.values(geo.tramos).filter((t) => t.nivel === 1 && ['entrada', 'conector', 'salida', 'ramal'].includes(t.tipo));
    }
    return geo._trazosSuelo;
  },

  _suelo(ctx, geo) {
    const C = this.COLORES;
    const w = geo.anchoCarril;
    const bm = geo.berma;
    const trazos = this._trazosSuelo(geo);

    // Dos pasadas: primero los andenes (más anchos) y encima el asfalto. Lo que queda verde entre las
    // calzadas son las isletas (con su borde de andén), incluidas las dos triangulares del corredor.
    const pasada = (color, extra) => {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      this._elipse(ctx, geo, -extra);
      ctx.fill();
      for (const s of geo.superficies) {
        this._poligono(ctx, s.pts);
        ctx.fill();
        if (extra > 0) {
          ctx.lineWidth = 2 * extra;
          ctx.stroke();
        }
      }
      ctx.lineWidth = w + 2 * bm + 2 * extra;
      for (const t of trazos) this._trazo(ctx, t.puntos);
    };
    pasada(C.anden, geo.anchoAnden);
    pasada(C.via, 0);

    // Isla central: sobreancho montable + bordillo + jardín con árboles.
    const iI = geo.insetInterno;
    ctx.fillStyle = C.sobreancho;
    this._elipse(ctx, geo, iI);
    ctx.fill();
    ctx.fillStyle = C.islaBorde;
    this._elipse(ctx, geo, iI + geo.sobreancho);
    ctx.fill();
    ctx.fillStyle = C.isla;
    this._elipse(ctx, geo, iI + geo.sobreancho + 0.35);
    ctx.fill();
    ctx.fillStyle = C.arbol;
    const a0 = geo.semiA - iI - geo.sobreancho, b0 = geo.semiB - iI - geo.sobreancho;
    for (let i = 0; i < 9; i++) {
      const th = Red.rad(i * 40 + 12);
      const f = i % 2 ? 0.42 : 0.7;
      this._circulo(ctx, geo.centro[0] + a0 * f * Math.cos(th), geo.centro[1] - b0 * f * Math.sin(th), i % 2 ? 1.5 : 2.0);
      ctx.fill();
    }
    for (const [x, y] of geo.arboles) {
      this._circulo(ctx, x, y, 1.6);
      ctx.fill();
    }

    // Bordes y división de carriles del anillo.
    ctx.strokeStyle = C.lineaBlanca;
    ctx.lineWidth = 0.15;
    this._elipse(ctx, geo, iI - 0.2);
    ctx.stroke();
    ctx.setLineDash([2.5, 2.5]);
    for (let k = 1; k < geo.nAnillo; k++) {
      this._elipse(ctx, geo, geo.bermaAnillo + geo.anchoCarrilAnillo * k);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Flechas del anillo (sentido antihorario: ← arriba, ↓ izquierda, → abajo, ↑ derecha).
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < geo.nAnillo; k++) {
      const anillo = geo.tramos['anillo_' + k];
      for (const th of [100, 190, 262, 340]) {
        const q = Red.punto(anillo, (anillo.largo * (th + k * 6)) / 360);
        this._flecha(ctx, q.x, q.y, q.ang);
      }
    }

    // Marcas entre carriles vecinos: doble línea amarilla entre sentidos opuestos, discontinua blanca
    // entre carriles del mismo sentido.
    const marcas = this._marcas(geo);
    ctx.strokeStyle = C.lineaCentral;
    ctx.lineWidth = 0.14;
    for (const m of marcas.amarillas) {
      for (const o of [-0.17, 0.17]) this._trazo(ctx, Red.desplazar(m, o));
    }
    ctx.strokeStyle = C.lineaBlanca;
    ctx.lineWidth = 0.12;
    ctx.setLineDash([3, 3]);
    for (const m of marcas.blancas) this._trazo(ctx, m);
    ctx.setLineDash([]);

    // Flechas de sentido en entradas, salidas y ramales.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const t of trazos) {
      if (t.tipo === 'conector' || (t.tipo === 'salida' && !t.cola)) continue;
      const desde = t.tipo === 'entrada' ? 14 : 6;
      for (let s = desde; s < t.largo - 5; s += 20) {
        const q = Red.punto(t, s);
        this._flecha(ctx, q.x, q.y, q.ang);
      }
    }

    // Línea de ceda el paso al final de cada carril de entrada (el ramal de giro libre no la tiene).
    for (const t of trazos) if (t.tipo === 'entrada' && t.carril !== 'ramal') this._cedaEn(ctx, geo, t, t.largo - 0.25);
  },

  /** Polilíneas medias entre carriles vecinos y paralelos (se calcula una sola vez por geometría). */
  _marcas(geo) {
    if (geo._marcas) return geo._marcas;
    const res = { amarillas: [], blancas: [] };
    const tramos = Object.values(geo.tramos).filter((t) => t.nivel === 1 && (t.tipo === 'entrada' || t.tipo === 'ramal' || (t.tipo === 'salida' && t.cola)));
    for (let i = 0; i < tramos.length; i++) {
      for (let j = i + 1; j < tramos.length; j++) {
        const A = tramos[i], B = tramos[j];
        let actual = null;
        const cerrar = () => {
          if (actual && actual.pts.length > 3) res[actual.tipo].push(actual.pts);
          actual = null;
        };
        for (let s = 0; s <= A.largo; s += 1) {
          const p = Red.punto(A, s);
          const sb = Red.masCercano(B.puntos, [p.x, p.y]);
          const q = Red.punto(B, sb);
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          const cos = Math.cos(p.ang - q.ang);
          const ok = d > 2.2 && d < 4.6 && Math.abs(cos) > 0.85 && sb > 0.5 && sb < B.largo - 0.5;
          if (!ok) { cerrar(); continue; }
          const tipo = cos < 0 ? 'amarillas' : 'blancas';
          if (actual && actual.tipo !== tipo) cerrar();
          if (!actual) actual = { tipo, pts: [] };
          actual.pts.push([(p.x + q.x) / 2, (p.y + q.y) / 2]);
        }
        cerrar();
      }
    }
    return (geo._marcas = res);
  },

  /** Línea de ceda el paso (discontinua + dientes) atravesando un tramo en la posición s. */
  _cedaEn(ctx, geo, tramo, s) {
    const C = this.COLORES;
    const q = Red.punto(tramo, s);
    const nx = -Math.sin(q.ang), ny = Math.cos(q.ang);
    const h = geo.anchoCarril / 2 - 0.15;
    ctx.strokeStyle = C.lineaBlanca;
    ctx.lineWidth = 0.4;
    ctx.setLineDash([0.6, 0.45]);
    this._linea(ctx, [q.x - nx * h, q.y - ny * h], [q.x + nx * h, q.y + ny * h]);
    ctx.setLineDash([]);
    ctx.fillStyle = C.lineaBlanca;
    const ex = -Math.cos(q.ang), ey = -Math.sin(q.ang); // hacia atrás (de donde viene)
    for (let o = -h + 0.5; o < h - 0.4; o += 1.2) {
      const bx = q.x + nx * o + ex * 0.7, by = q.y + ny * o + ey * 0.7;
      this._poligono(ctx, [[bx - nx * 0.35, by - ny * 0.35], [bx + nx * 0.35, by + ny * 0.35], [bx + ex * 1.0, by + ey * 1.0]]);
      ctx.fill();
    }
  },

  /* ---------------------------- Señales ---------------------------- */

  /** Carril de entrada más a la derecha del conductor (donde va la señal) y su línea de ceda. */
  _bocaEntrada(geo, id) {
    const a = geo.accesos[id];
    const ents = [...new Set(a.carrilesEntrada.map((c) => c.entrada))].map((x) => geo.tramos[x]);
    const der = ents.reduce((m, t) => (t.carril > m.carril ? t : m), ents[0]);
    return { acc: a, tramo: der, ents };
  },

  _senales(ctx, estado) {
    const geo = estado.geo;
    const C = this.COLORES;
    const modo = estado.control.modo;
    for (const id of geo.entradas) {
      const { acc, tramo } = this._bocaEntrada(geo, id);
      const q = Red.punto(tramo, tramo.largo - 2.5);
      const off = geo.anchoCarril / 2 + geo.berma + geo.anchoAnden / 2 + 0.6; // en el andén derecho
      const x = q.x - Math.sin(q.ang) * off;
      const y = q.y + Math.cos(q.ang) * off;
      if (modo === 'actual') {
        // Ceda el paso: triángulo invertido (el anillo tiene prelación).
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d93a3a';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(-1.5, -1.2); ctx.lineTo(1.5, -1.2); ctx.lineTo(0, 1.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      } else if (modo === 'semaforo') {
        const luz = estado.control.luces[id];
        ctx.fillStyle = C.apagado;
        this._circulo(ctx, x, y, 1.6); ctx.fill();
        ctx.fillStyle = luz === 'verde' ? C.verde : luz === 'amarillo' ? C.amarillo : C.rojo;
        this._circulo(ctx, x, y, 1.15); ctx.fill();
        // Luz del anillo frente a la entrada: roja cuando la entrada tiene verde.
        const con = geo.tramos[acc.carrilesEntrada[0].conector];
        const p = geo.elipse(geo.insetInterno + 0.8, con.psi - 10);
        ctx.fillStyle = C.apagado;
        this._circulo(ctx, p[0], p[1], 0.9); ctx.fill();
        ctx.fillStyle = luz === 'verde' || luz === 'amarillo' ? C.rojo : C.verde;
        this._circulo(ctx, p[0], p[1], 0.62); ctx.fill();
      }
    }
  },

  _agentes(ctx, estado) {
    if (estado.control.modo !== 'alternativa') return;
    const geo = estado.geo;
    for (const id of geo.entradas) {
      const { acc, ents } = this._bocaEntrada(geo, id);
      const turno = estado.control.luces[id] === 'verde';
      // El agente se para en el sobreancho de la isla, frente a su entrada, mirando a la línea de ceda.
      const con = geo.tramos[acc.carrilesEntrada[0].conector];
      const pos = geo.elipse(geo.insetInterno + 0.9, con.psi - 6);
      const fin = ents.map((t) => t.puntos[t.puntos.length - 1]);
      const obj = [fin.reduce((s, p) => s + p[0], 0) / fin.length, fin.reduce((s, p) => s + p[1], 0) / fin.length];
      const ang = Math.atan2(obj[1] - pos[1], obj[0] - pos[0]);
      ctx.save();
      ctx.translate(pos[0], pos[1]);
      ctx.strokeStyle = turno ? '#2fd15a' : '#ff4040';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * (turno ? 3.2 : 2.2), Math.sin(ang) * (turno ? 3.2 : 2.2));
      ctx.stroke();
      ctx.fillStyle = this.COLORES.agente;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.25;
      this._circulo(ctx, 0, 0, 1.1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c8ff3d'; // chaleco reflectivo
      this._circulo(ctx, 0, 0, 0.45); ctx.fill();
      ctx.restore();
    }
  },

  /* --------------------------- Vehículos --------------------------- */

  _vehiculo(ctx, geo, veh) {
    const C = this.COLORES;
    const p = Motor.posicionMundo(geo, veh);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angulo); // eje x local = sentido de avance
    const L = veh.largo;
    const A = veh.ancho;

    ctx.fillStyle = C[veh.tipo];
    ctx.strokeStyle = veh.estado === 'en_cola' ? C.enCola : C.contorno;
    ctx.lineWidth = veh.estado === 'en_cola' ? 0.3 : 0.15;
    ctx.beginPath();
    ctx.rect(-L / 2, -A / 2, L, A);
    ctx.fill();
    ctx.stroke();

    if (veh.tipo === 'moto') {
      ctx.fillStyle = '#222'; // casco
      this._circulo(ctx, -0.1, 0, 0.32);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(210,235,255,0.85)'; // parabrisas
      ctx.fillRect(L / 2 - (veh.tipo === 'buseta' ? 1.3 : 1.6), -A / 2 + 0.25, 0.8, A - 0.5);
    }
    ctx.restore();
  },

  /* ----------------------------- Capa 3: puente ----------------------------- */

  /** Franja de una calzada del puente entre los desplazamientos o0 y o1 de su eje. */
  _franjaPuente(ctx, cz, o0, o1) {
    const a = Red.desplazar(cz.eje.puntos, o0);
    const b = Red.desplazar(cz.eje.puntos, o1).reverse();
    this._poligono(ctx, a.concat(b));
  },

  _puente(ctx, geo) {
    const p = geo.puente;
    if (!p) return;
    const C = this.COLORES;
    const f = p.fuente;
    const s = p.semiAncho;

    // Sombra proyectada sobre el nivel inferior.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.save();
    ctx.translate(1.3, 1.9);
    for (const cz of p.calzadas) {
      this._franjaPuente(ctx, cz, -s, s);
      ctx.fill();
    }
    ctx.restore();

    // Tableros de asfalto opaco y sólido: tapan todo lo que pasa por debajo.
    ctx.fillStyle = C.puente;
    for (const cz of p.calzadas) {
      this._franjaPuente(ctx, cz, -s, s);
      ctx.fill();
    }

    ctx.lineJoin = 'round';
    for (const cz of p.calzadas) {
      // Barandas a ambos lados de cada calzada (filo oscuro hacia afuera + concreto claro).
      ctx.strokeStyle = C.puenteFilo;
      ctx.lineWidth = 0.25;
      for (const o of [-s + 0.12, s - 0.12]) this._trazo(ctx, Red.desplazar(cz.eje.puntos, o));
      ctx.strokeStyle = C.puenteBorde;
      ctx.lineWidth = f.baranda * 0.8;
      for (const o of [-s + 0.25 + f.baranda * 0.4, s - 0.25 - f.baranda * 0.4]) this._trazo(ctx, Red.desplazar(cz.eje.puntos, o));
      // División entre los carriles del mismo sentido.
      ctx.strokeStyle = C.lineaBlanca;
      ctx.lineWidth = 0.12;
      ctx.setLineDash([3, 3]);
      for (let j = 1; j < f.carrilesPorSentido; j++) {
        this._trazo(ctx, Red.desplazar(cz.eje.puntos, f.anchoCarril * (j - f.carrilesPorSentido / 2)));
      }
      ctx.setLineDash([]);
      // Flechas de sentido (cada calzada es de un solo sentido: el de su eje).
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let j = 0; j < f.carrilesPorSentido; j++) {
        const o = f.anchoCarril * (j + 0.5 - f.carrilesPorSentido / 2);
        for (let s0 = 20 + j * 9; s0 < cz.eje.largo - 12; s0 += 26) {
          const q = Red.punto(cz.eje, s0);
          this._flecha(ctx, q.x - Math.sin(q.ang) * o, q.y + Math.cos(q.ang) * o, q.ang, 1.6, 0.7);
        }
      }
    }
  },

  /* ----------------------------- Textos ----------------------------- */

  /** Caja de texto de una o más líneas, centrada en (px, py) y siempre dentro del lienzo. */
  _cajaLineas(ctx, r, lineas, px, py, color, fondo = 'rgba(255,255,255,0.86)') {
    const alto = 16;
    const w = Math.max(...lineas.map((l) => ctx.measureText(l).width)) + 12;
    const h = lineas.length * alto + 5;
    const x = Math.min(r.ancho - w / 2 - 6, Math.max(w / 2 + 6, px));
    const y = Math.min(r.alto - h / 2 - 6, Math.max(42 + h / 2, py));
    ctx.fillStyle = fondo;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    lineas.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + 2.5 + alto * (i + 0.5)));
  },

  _etiquetas(ctx, r, estado) {
    const geo = estado.geo;
    const C = this.COLORES;
    const aPx = (m) => [m[0] * r.escala, m[1] * r.escala];
    const chico = r.ancho < 560;
    ctx.font = `600 ${chico ? 10 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (const id of Object.keys(geo.accesos)) {
      const a = geo.accesos[id];
      if (!a.posEtiqueta) continue;
      const entra = a.carrilesEntrada.length > 0;
      const sale = a.carrilesSalida.length > 0;
      const sentido = entra && sale ? 'entra y sale' : entra ? 'entrada' : 'salida';
      const pend = entra ? estado.pendientes[id].length : 0;
      const lineas = [...a.etiquetas, sentido + (pend > 0 ? `  +${pend} afuera` : '')];
      const [px, py] = aPx(a.posEtiqueta);
      this._cajaLineas(ctx, r, lineas, px, py, pend > 0 ? C.enCola : C.texto);
    }

    // Rótulos del puente, girados sobre cada calzada.
    if (geo.puente) {
      const p = geo.puente;
      const sitios = { sup: [80, 24.5], inf: [84, 32.5] };
      const textos = { sup: `${p.fuente.nombre.toUpperCase()} · AL SUROESTE`, inf: `${p.fuente.nombre.toUpperCase()} · AL NORESTE` };
      ctx.font = `700 ${chico ? 8 : 10}px system-ui, sans-serif`;
      for (const cz of p.calzadas) {
        const objetivo = geo.aM(sitios[cz.id] || [70, 30]);
        const q = Red.punto(cz.eje, Red.masCercano(cz.eje.puntos, objetivo));
        const [px, py] = aPx([q.x, q.y]);
        let ang = q.ang;
        if (Math.abs(ang) > Math.PI / 2) ang += Math.PI;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(textos[cz.id] || cz.nombre, 0, 0);
        ctx.restore();
      }
    }

    // Reloj, modo, perfil e intervalo de aforo.
    const t = estado.t;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    let linea = `${mm}:${ss}  ·  ${Control.MODOS[estado.control.modo]}  ·  ${estado.perfil === 'pico' ? 'Pico' : 'Valle'} ${Llegadas.intervaloActual(estado)}`;
    const fase = Control.faseActual(estado);
    if (fase) linea += `  ·  cambio en ${Math.ceil(fase.restante)} s`;
    ctx.textAlign = 'left';
    ctx.font = `600 ${chico ? 11 : 13}px system-ui, sans-serif`;
    const w = ctx.measureText(linea).width + 16;
    ctx.fillStyle = 'rgba(20,24,28,0.78)';
    ctx.fillRect(8, 8, w, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(linea, 16, 21);
  },
};
