/* datos_respaldo.js — COPIA de geometria.json, conteos.json y parametros.json.
 * Existe para que index.html funcione con doble clic (file://), donde el
 * navegador bloquea fetch() de archivos locales por CORS.
 * Si cambian los .json, actualicen también este archivo (mismo contenido). */
window.DATOS_RESPALDO = {
  geometria: {
    "nombre": "Cruce de ejemplo en Santa Marta: avenida principal (E–O) × carrera (N–S)",
    "nota": "Medidas ilustrativas. Reemplazar con las medidas tomadas en campo por el equipo.",
    "unidades": "metros",
    "longitudAcceso": 80,
    "anchoCarril": 3.5,
    "berma": 1.2,
    "anchoPasoPeatonal": 3.0,
    "anchoAnden": 2.5,
    "desplazamientoFiltro": 1.35,
    "accesos": [
      { "id": "N", "nombre": "Norte", "via": "Carrera (sentido N→S)", "eje": "NS", "direccion": [0, 1] },
      { "id": "S", "nombre": "Sur", "via": "Carrera (sentido S→N)", "eje": "NS", "direccion": [0, -1] },
      { "id": "E", "nombre": "Este", "via": "Avenida (sentido E→O)", "eje": "EO", "direccion": [-1, 0] },
      { "id": "O", "nombre": "Oeste", "via": "Avenida (sentido O→E)", "eje": "EO", "direccion": [1, 0] }
    ]
  }
  ,
  conteos: {
    "descripcion": "Tasas de llegada en vehículos por hora, por acceso y tipo. Valores de ejemplo para hora pico; reemplazar con el aforo real del equipo.",
    "periodo": "Hora pico de la tarde (ejemplo)",
    "unidades": "veh/h",
    "tasas": {
      "N": { "moto": 260, "carro": 140, "buseta": 12 },
      "S": { "moto": 240, "carro": 130, "buseta": 10 },
      "E": { "moto": 520, "carro": 300, "buseta": 40 },
      "O": { "moto": 500, "carro": 280, "buseta": 36 }
    }
  }
  ,
  parametros: {
    "simulacion": {
      "dt": 0.1,
      "semilla": 2026,
      "minutosComparacion": 15
    },
    "vehiculos": {
      "moto":   { "largo": 2.0, "ancho": 0.8, "velDeseada": 11.1, "acelMax": 3.0, "decelComoda": 3.5, "decelMax": 7.0, "distMinima": 1.0, "tiempoSeguimiento": 0.8 },
      "carro":  { "largo": 4.5, "ancho": 1.8, "velDeseada": 11.1, "acelMax": 2.0, "decelComoda": 3.0, "decelMax": 7.5, "distMinima": 2.0, "tiempoSeguimiento": 1.4 },
      "buseta": { "largo": 8.5, "ancho": 2.4, "velDeseada": 9.7,  "acelMax": 1.2, "decelComoda": 2.5, "decelMax": 6.0, "distMinima": 2.5, "tiempoSeguimiento": 1.6 }
    },
    "motos": {
      "filtrado": true,
      "brechaFiltrado": 1.5,
      "velMaxFiltrado": 5.0
    },
    "control": {
      "modoInicial": "actual",
      "distanciaDecision": 25,
      "actual": { "ejePrincipal": "EO", "brechaCritica": 4.0 },
      "semaforo": { "verdeEO": 30, "verdeNS": 20, "amarillo": 3, "todoRojo": 2 },
      "alternativa": { "turno": 12, "despeje": 3, "orden": ["N", "E", "S", "O"] }
    },
    "metricas": {
      "ventanaCapacidad": 60,
      "umbralVelocidadCola": 1.0
    }
  }
};
