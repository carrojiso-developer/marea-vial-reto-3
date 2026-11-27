/* =========================================================================
 * interfaz.js — Conecta el DOM con el motor y el dibujo.
 *
 * - Carga los datos: intenta leer los .json (GitHub Pages / servidor) y, si
 *   no puede (doble clic, file://, sin internet), usa window.DATOS_RESPALDO.
 * - Bucle de animación: acumula tiempo real × velocidad (x1, x5, x10) y lo
 *   consume en pasos fijos de dt llamando a Motor.paso.
 * - Panel de control, tablero de métricas y comparador de modos.
 * ========================================================================= */
'use strict';

(async function iniciar() {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const AYUDA_MODOS = {
    actual: 'Prelación: quien ya circula en el anillo (antihorario) tiene la vía. Carrera 15, Corredor inferior, Corredor Este y Calle 40 / Paralela solo entran cuando el próximo vehículo del anillo está a más de la brecha crítica. Quienes suben por el Corredor inferior hacia el Este siguen de largo rozando el anillo y ceden al unirse a la salida Este. Carrera 15 Sur (↙) y el Ramal inferior (↓) solo reciben vehículos. El Puente Ruta 90 (nivel superior) nunca cede ni frena.',
    semaforo: 'Semáforo virtual en las cuatro entradas al anillo, una a la vez (Carrera 15 → Corredor inferior → Corredor Este → Calle 40 / Paralela), con amarillo y todo-rojo. Nunca hay dos verdes en conflicto; el anillo cede frente a la entrada en verde mientras no esté congestionado. El giro libre del Corredor inferior hacia el Este y el Puente Ruta 90 no tienen semáforo.',
    alternativa: 'Agentes de tránsito que dan paso por demanda, como un agente real: en cada cambio de turno miran la cola de Carrera 15, Corredor inferior, Corredor Este y Calle 40 / Paralela y le dan paso a la entrada con más vehículos esperando (las vacías no reciben turno). El turno sigue hasta que esa cola baja a 2 vehículos o se cumple el tope de seguridad de 40 s, y el agente detiene el anillo frente a la entrada que tiene el turno.',
  };


  // ---------- Carga de datos ----------
  async function cargarDatos() {
    if (location.protocol !== 'file:') {
      try {
        const leer = (archivo) => fetch(archivo, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error(archivo + ': ' + r.status);
          return r.json();
        });
        const [geometria, conteos, parametros] = await Promise.all([
          leer('geometria.json'), leer('conteos.json'), leer('parametros.json'),
        ]);
        return { datos: { geometria, conteos, parametros }, fuente: 'Datos: archivos .json' };
      } catch (e) {
        console.warn('No se pudieron leer los .json; se usa datos_respaldo.js', e);
      }
    }
    if (!window.DATOS_RESPALDO) throw new Error('Falta datos_respaldo.js');
    return { datos: window.DATOS_RESPALDO, fuente: 'Datos: respaldo offline' };
  }

  const { datos, fuente } = await cargarDatos();
  $('#fuente-datos').textContent = fuente;
  $('#nombre-cruce').textContent = datos.geometria.nombre;

  // ---------- Estado de la interfaz ----------
  let estado = Motor.crear(datos);
  const render = Dibujo.crear($('#lienzo'));
  let perfil = estado.perfil;
  let velocidad = 1;
  let pausado = false;
  let acumulado = 0;
  let ultimoTs = null;
  let ultimoTablero = 0;

  $('#semilla').value = estado.semilla;
  $('#minutos-comp').value = datos.parametros.simulacion.minutosComparacion;

  /** Datos con los parámetros actuales de la interfaz (para reiniciar o comparar). */
  function datosActuales() {
    return { geometria: datos.geometria, conteos: estado.conteos, parametros: estado.param };
  }

  function reiniciar() {
    const semilla = parseInt($('#semilla').value, 10);
    const modo = estado.control.modo;
    estado = Motor.crear(datosActuales(), { semilla: Number.isFinite(semilla) ? semilla : 0, modo, perfil });
    acumulado = 0;
    actualizarTablero();
  }

  // ---------- Controles ----------
  $('#btn-pausa').addEventListener('click', () => {
    pausado = !pausado;
    $('#btn-pausa').textContent = pausado ? 'Continuar' : 'Pausar';
  });
  $('#btn-reiniciar').addEventListener('click', reiniciar);
  $('#semilla').addEventListener('change', reiniciar);

  function mostrarPerfil() {
    $$('#perfiles button').forEach((x) => x.classList.toggle('activo', x.dataset.perfil === perfil));
  }
  for (const b of $$('#perfiles button')) {
    b.addEventListener('click', () => {
      perfil = b.dataset.perfil;
      mostrarPerfil();
      reiniciar();
    });
  }
  mostrarPerfil();

  for (const b of $$('#velocidad button')) {
    b.addEventListener('click', () => {
      velocidad = Number(b.dataset.vel);
      $$('#velocidad button').forEach((x) => x.classList.toggle('activo', x === b));
    });
  }

  function mostrarModo(modo) {
    $$('#modos button').forEach((x) => x.classList.toggle('activo', x.dataset.modo === modo));
    $$('.grupo-param').forEach((g) => g.classList.toggle('visible', g.dataset.para === modo));
    $('#ayuda-modo').textContent = AYUDA_MODOS[modo];
  }
  for (const b of $$('#modos button')) {
    b.addEventListener('click', () => {
      Motor.cambiarModo(estado, b.dataset.modo); // en caliente, sin reiniciar
      mostrarModo(b.dataset.modo);
    });
  }
  mostrarModo(estado.control.modo);

  // Parámetros de control editables en vivo (se escriben en estado.param.control).
  for (const input of $$('input[data-param]')) {
    const [grupo, clave] = input.dataset.param.split('.');
    input.value = estado.param.control[grupo][clave];
    input.addEventListener('change', () => {
      const valor = parseFloat(input.value);
      const min = parseFloat(input.min);
      const max = parseFloat(input.max);
      if (!Number.isFinite(valor)) { input.value = estado.param.control[grupo][clave]; return; }
      const acotado = Math.min(max, Math.max(min, valor));
      input.value = acotado;
      estado.param.control[grupo][clave] = acotado;
    });
  }

  // ---------- Tablero de métricas ----------
  const filasColas = {};
  // Accesos con entrada al anillo (las salidas puras no hacen cola).
  const idsEntradas = (geo) => geo.entradas;
  const nombreAcceso = (geo, id) => geo.accesos[id].nombre;
  for (const id of idsEntradas(estado.geo)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${nombreAcceso(estado.geo, id)}</td><td></td><td></td><td></td>`;
    $('#m-colas').appendChild(tr);
    filasColas[id] = tr.children;
  }

  function actualizarTablero() {
    const m = estado.metricas;
    const r = Metricas.resumen(estado);
    $('#m-capacidad').textContent = m.capacidad;
    $('#m-espera').textContent = m.esperaPromedio.toFixed(1);
    $('#m-enred').textContent = estado.vehiculos.length;
    for (const id of Object.keys(filasColas)) {
      filasColas[id][1].textContent = m.colaActual[id];
      filasColas[id][2].textContent = m.colaMax[id];
      filasColas[id][3].textContent = r.esperaPorAcceso[id].toFixed(1) + ' s';
    }
  }

  // ---------- Comparador ----------
  function compararModos() {
    const boton = $('#btn-comparar');
    const minutos = Math.max(1, Math.min(120, parseFloat($('#minutos-comp').value) || 15));
    const semilla = parseInt($('#semilla').value, 10) || 0;
    boton.disabled = true;
    boton.textContent = 'Calculando…';

    // setTimeout deja que el navegador pinte el texto antes del cálculo.
    setTimeout(() => {
      const base = Motor.clonar(datosActuales());
      const modos = ['actual', 'semaforo', 'alternativa'];
      const res = modos.map((modo) => Motor.correrSinPantalla(base, modo, semilla, minutos, perfil));
      const ids = idsEntradas(estado.geo);

      // [rótulo, función valor, decimales, ¿mejor es mayor?]
      const filas = [
        ['Capacidad de evacuación (veh, último minuto)', (r) => r.capacidadUltimoMinuto, 0, true],
        ['Evacuación promedio (veh/min)', (r) => r.salidasPorMinuto, 1, true],
        ['Tiempo promedio de espera (s)', (r) => r.esperaPromedio, 1, false],
        ...ids.map((id) => [`Cola máxima · ${nombreAcceso(estado.geo, id)}`, (r) => r.colaMax[id], 0, false]),
        ...ids.map((id) => [`Espera promedio · ${nombreAcceso(estado.geo, id)} (s)`, (r) => r.esperaPorAcceso[id], 1, false]),
        ['Vehículos evacuados (total)', (r) => r.totalSalidos, 0, true],
        ['Vehículos sin evacuar al final', (r) => r.sinEvacuar, 0, false],
      ];

      const tbody = $('#tabla-comparador tbody');
      tbody.innerHTML = '';
      for (const [rotulo, f, dec, mayorEsMejor] of filas) {
        const valores = res.map(f);
        const mejor = mayorEsMejor ? Math.max(...valores) : Math.min(...valores);
        const hayDiferencia = valores.some((v) => v !== valores[0]);
        const tr = document.createElement('tr');
        const td0 = document.createElement('td');
        td0.textContent = rotulo;
        tr.appendChild(td0);
        for (const v of valores) {
          const td = document.createElement('td');
          td.textContent = v.toFixed(dec);
          if (hayDiferencia && v === mejor) td.className = 'mejor';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      const nota = document.createElement('tr');
      nota.innerHTML = `<td colspan="4" class="vacio">${minutos} min simulados · ${datos.conteos.perfiles[perfil].nombre} · semilla ${semilla} · resaltado = mejor valor</td>`;
      tbody.appendChild(nota);

      boton.disabled = false;
      boton.textContent = 'Comparar';
    }, 30);
  }
  $('#btn-comparar').addEventListener('click', compararModos);

  // ---------- Bucle principal ----------
  function bucle(ts) {
    if (ultimoTs !== null && !pausado) {
      // Tope de 0.25 s reales por cuadro para no congelarse al volver a la pestaña.
      acumulado += Math.min(0.25, (ts - ultimoTs) / 1000) * velocidad;
      while (acumulado >= estado.dt) {
        Motor.paso(estado);
        acumulado -= estado.dt;
      }
    }
    ultimoTs = ts;
    Dibujo.dibujar(render, estado);
    if (ts - ultimoTablero > 200) {
      actualizarTablero();
      ultimoTablero = ts;
    }
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);
})().catch((e) => {
  console.error(e);
  const aviso = document.getElementById('fuente-datos');
  if (aviso) aviso.textContent = 'Error: ' + e.message;
});
