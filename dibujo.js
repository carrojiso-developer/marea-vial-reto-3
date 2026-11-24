/* =========================================================================
 * dibujo.js — Renderizado 2D en <canvas>.
 *
 * Solo LEE el estado que produce el motor y lo pinta. Nunca modifica el
 * estado. Todo se dibuja en metros (la transformación del contexto escala
 * metros → píxeles), con el centro de la intersección en (0, 0) y el eje y
 * hacia abajo (norte arriba).
 * ========================================================================= */
'use strict';

const Dibujo = {
  COLORES: {
    fondo: '#b9d3a8',
    anden: '#d8d2c4',
    via: '#4a4d52',
    berma: '#55585e',
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
  },

  RADIO_VISTA: 55, // metros visibles desde el centro (los vehículos entran desde fuera de la vista)

  crear(canvas) {
    return { canvas, ctx: canvas.getContext('2d'), dpr: 1, tam: 0, escala: 1 };
  },

  /** Ajusta la resolución interna del canvas a su tamaño en pantalla. */
  ajustar(r, geo) {
    const dpr = window.devicePixelRatio || 1;
    const tam = Math.max(200, Math.floor(r.canvas.clientWidth));
    if (tam !== r.tam || dpr !== r.dpr) {
      r.canvas.width = tam * dpr;
      r.canvas.height = tam * dpr;
      r.tam = tam;
      r.dpr = dpr;
    }
    r.radio = Math.min(geo.L, this.RADIO_VISTA);
    r.escala = tam / (2 * r.radio); // píxeles CSS por metro
  },

  /** Punto en el mundo a partir de (s, lateral) sobre un acceso. */
  _punto(acc, s, lateral) {
    return [
      acc.origen[0] + acc.dir[0] * s + acc.derecha[0] * lateral,
      acc.origen[1] + acc.dir[1] * s + acc.derecha[1] * lateral,
    ];
  },

  dibujar(r, estado) {
    const geo = estado.geo;
    this.ajustar(r, geo);
    const ctx = r.ctx;
    const k = r.escala * r.dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.COLORES.fondo;
    ctx.fillRect(0, 0, r.canvas.width, r.canvas.height);

    // A partir de aquí se dibuja en metros.
    ctx.setTransform(k, 0, 0, k, r.canvas.width / 2, r.canvas.height / 2);
    this._via(ctx, geo);
    this._senales(ctx, estado);
    for (const veh of estado.vehiculos) this._vehiculo(ctx, geo, veh);
    this._agente(ctx, estado);

    // Textos en píxeles.
    ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    this._etiquetas(ctx, r, estado);
  },

  _via(ctx, geo) {
    const C = this.COLORES;
    const L = geo.L;
    const sv = geo.semiVia;
    const an = geo.anchoAnden;

    // Andenes y calzadas (cruz).
    ctx.fillStyle = C.anden;
    ctx.fillRect(-L, -sv - an, 2 * L, 2 * (sv + an));
    ctx.fillRect(-sv - an, -L, 2 * (sv + an), 2 * L);
    ctx.fillStyle = C.via;
    ctx.fillRect(-L, -sv, 2 * L, 2 * sv);
    ctx.fillRect(-sv, -L, 2 * sv, 2 * L);

    const inicioCaja = L - sv - geo.anchoPasoPeatonal; // s donde empieza la cebra
    for (const id of Object.keys(geo.accesos)) {
      const acc = geo.accesos[id];

      // Bermas: tono algo más claro, solo en el tramo de entrada (el de salida lo pinta el acceso opuesto).
      ctx.fillStyle = C.berma;
      this._rectS(ctx, acc, 0, inicioCaja, geo.anchoCarril, sv);

      // Línea central amarilla doble (solo la mitad de entrada, el acceso opuesto pinta la otra).
      ctx.strokeStyle = C.lineaCentral;
      ctx.lineWidth = 0.15;
      for (const lat of [-0.15, 0.15]) this._linea(ctx, acc, 0, inicioCaja, lat);

      // Borde de carril (discontinuo).
      ctx.strokeStyle = C.lineaBlanca;
      ctx.lineWidth = 0.12;
      ctx.setLineDash([3, 3]);
      this._linea(ctx, acc, 0, inicioCaja, geo.anchoCarril);
      ctx.setLineDash([]);

      // Línea de pare.
      ctx.lineWidth = 0.45;
      const a = this._punto(acc, geo.sParada + 0.25, 0.1);
      const b = this._punto(acc, geo.sParada + 0.25, sv);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();

      // Paso peatonal (cebra) en toda la calzada.
      ctx.fillStyle = 'rgba(244,244,244,0.9)';
      for (let lat = -sv + 0.25; lat < sv - 0.2; lat += 1.0) {
        this._rectS(ctx, acc, inicioCaja + 0.2, L - sv - 0.2, lat, lat + 0.5);
      }
    }
  },

  /** Rectángulo definido en coordenadas (s, lateral) de un acceso. */
  _rectS(ctx, acc, s0, s1, l0, l1) {
    const p = [this._punto(acc, s0, l0), this._punto(acc, s1, l0), this._punto(acc, s1, l1), this._punto(acc, s0, l1)];
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
    ctx.fill();
  },

  _linea(ctx, acc, s0, s1, lat) {
    const a = this._punto(acc, s0, lat);
    const b = this._punto(acc, s1, lat);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  },

  _senales(ctx, estado) {
    const geo = estado.geo;
    const C = this.COLORES;
    const modo = estado.control.modo;
    for (const id of Object.keys(geo.accesos)) {
      const acc = geo.accesos[id];
      const [x, y] = this._punto(acc, geo.sParada - 1.5, geo.semiVia + geo.anchoAnden / 2 + 0.4);
      if (modo === 'actual') {
        const principal = acc.eje === estado.param.control.actual.ejePrincipal;
        ctx.save();
        ctx.translate(x, y);
        if (principal) {
          // Señal de vía preferencial: rombo amarillo.
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
          ctx.fillStyle = '#f2c230';
          ctx.fillRect(-0.95, -0.95, 1.9, 1.9);
        } else {
          // Señal de ceda el paso: triángulo invertido.
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#d93a3a';
          ctx.lineWidth = 0.45;
          ctx.beginPath();
          ctx.moveTo(-1.5, -1.2); ctx.lineTo(1.5, -1.2); ctx.lineTo(0, 1.5); ctx.closePath();
          ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      } else {
        const luz = estado.control.luces[id];
        ctx.fillStyle = C.apagado;
        ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = luz === 'verde' ? C.verde : luz === 'amarillo' ? C.amarillo : C.rojo;
        ctx.beginPath(); ctx.arc(x, y, 1.15, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

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
      // Casco del conductor.
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-0.1, 0, 0.32, 0, Math.PI * 2); ctx.fill();
    } else {
      // Parabrisas.
      ctx.fillStyle = 'rgba(210,235,255,0.85)';
      ctx.fillRect(L / 2 - (veh.tipo === 'buseta' ? 1.3 : 1.6), -A / 2 + 0.25, 0.8, A - 0.5);
    }
    ctx.restore();
  },

  _agente(ctx, estado) {
    if (estado.control.modo !== 'alternativa') return;
    const fase = Control.faseActual(estado);
    ctx.fillStyle = '#1b3a8a';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.25;
    ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (fase && fase.acceso) {
      // Brazo señalando el acceso que tiene el turno.
      const acc = estado.geo.accesos[fase.acceso];
      ctx.strokeStyle = '#2fd15a';
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-acc.dir[0] * 3.2, -acc.dir[1] * 3.2);
      ctx.stroke();
    }
  },

  _etiquetas(ctx, r, estado) {
    const geo = estado.geo;
    const tam = r.tam;
    const C = this.COLORES;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    for (const id of Object.keys(geo.accesos)) {
      const acc = geo.accesos[id];
      // Etiqueta junto al borde de entrada, del lado del carril.
      const [mx, my] = this._punto(acc, geo.L - r.radio + 6, geo.semiVia + geo.anchoAnden + 5);
      const pend = estado.pendientes[id].length;
      const texto = acc.nombre + (pend > 0 ? `  +${pend} afuera` : '');
      ctx.textAlign = 'center';
      const w = ctx.measureText(texto).width + 12;
      // Se mantiene dentro del lienzo y debajo del reloj.
      const px = Math.min(tam - w / 2 - 8, Math.max(w / 2 + 8, tam / 2 + mx * r.escala));
      const py = Math.min(tam - 20, Math.max(56, tam / 2 + my * r.escala));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(px - w / 2, py - 11, w, 22);
      ctx.fillStyle = pend > 0 ? C.enCola : C.texto;
      ctx.fillText(texto, px, py);
    }

    // Reloj y modo.
    const t = estado.t;
    const mm = String(Math.floor(t / 60)).padStart(2, '0');
    const ss = String(Math.floor(t % 60)).padStart(2, '0');
    let linea = `${mm}:${ss}  ·  ${Control.MODOS[estado.control.modo]}`;
    const fase = Control.faseActual(estado);
    if (fase) linea += `  ·  cambio en ${Math.ceil(fase.restante)} s`;
    ctx.textAlign = 'left';
    ctx.font = '600 13px system-ui, sans-serif';
    const w = ctx.measureText(linea).width + 16;
    ctx.fillStyle = 'rgba(20,24,28,0.78)';
    ctx.fillRect(10, 10, w, 26);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(linea, 18, 23);
  },
};
