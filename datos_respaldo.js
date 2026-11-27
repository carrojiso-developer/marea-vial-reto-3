/* datos_respaldo.js — COPIA EXACTA de geometria.json, conteos.json y parametros.json.
 * Existe para que index.html funcione con doble clic (file://, sin internet), donde
 * el navegador bloquea fetch() de archivos locales por CORS.
 * Si cambian los .json, actualicen también este archivo (mismo contenido). */
window.DATOS_RESPALDO = {
  geometria: {
    "nombre": "Glorieta de La Lucha · Santa Marta",
    "ubicacion": { "lat": 11.218753, "lon": -74.190173 },
    "nota": "Vista aérea de dos niveles, norte arriba. TODAS las coordenadas [x, y] están en % del lienzo: (0, 0) = esquina superior izquierda, (100, 100) = esquina inferior derecha; lienzo 3:2 de 150 m × 100 m. Nivel 1 (suelo): anillo antihorario, Carrera 15, Carrera 15 Sur, Calle 40 / Paralela, corredor inferior–este y sus dos isletas triangulares. Nivel 2: Puente Ruta 90 (dos calzadas opacas que cruzan por encima del cuadrante sureste del anillo y de la isla). Ángulos del anillo (theta) en grados: 0 = 3:00, 90 = 12:00, 180 = 9:00, 270 = 6:00, crecen en sentido antihorario. Circulación por la derecha.",
    "unidades": "metros (salvo coordenadas en % del lienzo)",
    "lienzo": { "ancho": 150, "alto": 100 },
    "anillo": {
      "centro": [45, 50],
      "radio": 25,
      "notaRadio": "Radio del borde exterior en % del lado MENOR del lienzo (escala uniforme): 25 % de 100 m = 25 m. Así la glorieta es un círculo perfecto: arriba y = 25 %, abajo y = 75 %, izquierda x ≈ 28.33 %, derecha x ≈ 61.67 %.",
      "carriles": 2, "anchoCarril": 3.5, "berma": 0.6, "sobreancho": 1.5,
      "sentido": "antihorario"
    },
    "anchoCarril": 3.3,
    "berma": 0.35,
    "anchoAnden": 1.1,
    "distanciaCeda": 3.0,
    "distanciaSalida": 3.0,
    "extension": 12,
    "anguloEntrada": { "externo": 14, "interno": 26 },
    "anguloSalida": { "externo": 14, "interno": 26 },
    "velocidadesMax": { "conector": 7.0, "anillo": 8.3, "salida": 9.7, "ramal": 8.3, "puente": 16.7 },

    "curvas": {
      "C15_oeste":  [{ "bezier": [[30, 0], [30, 16], [28.33, 32], [28.33, 48]] }],
      "C15_este":   [{ "bezier": [[37, 0], [37, 11], [40.4, 22.3], [49.31, 25.85]] }],
      "C15S_oeste": [{ "bezier": [[28.33, 50], [28.33, 62], [17, 82], [10, 100]] }],
      "C40_norte":  [{ "linea": [[55.21, 30.24], [99, 0]] }],
      "C40_sur":    [{ "linea": [[58.9, 36.2], [100, 7]] }],
      "E_entrada":  [{ "bezier": [[100, 43], [87, 43.4], [74, 44.6], [61.6, 47]] }],
      "SI_salida":  [{ "linea": [[40.7, 74.15], [28, 100]] }],
      "corredor": [
        { "haciaAnillo": { "desde": [33, 100], "theta": 277.5, "fuera": 1.6, "fuerza": [0.35, 0.4] } },
        { "arcoAnillo": { "desde": 277.5, "hasta": 310, "fuera": 1.6 } },
        { "desdeAnillo": { "theta": 310, "fuera": 1.6, "hasta": [100, 48], "dirFinal": [1, -0.33], "fuerza": [0.4, 0.35] } }
      ]
    },

    "superficies": [
      { "nombre": "Carrera 15 (embudo 9:00–12:30)", "contorno": [{ "punto": [30, -4] }, { "curva": "C15_oeste" }, { "punto": [28.33, 50] }, { "punto": [45, 50] }, { "curvaInvertida": "C15_este" }, { "punto": [37, -4] }] },
      { "nombre": "Carrera 15 Sur (bajo el costado oeste del puente)", "contorno": [{ "punto": [28.33, 48] }, { "curva": "C15S_oeste" }, { "punto": [8.8, 104] }, { "punto": [15, 104] }, { "punto": [15, 100] }, { "punto": [33.21, 67.68] }, { "punto": [45, 50] }] },
      { "nombre": "Calle 40 / Paralela (1:15–2:00)", "contorno": [{ "punto": [45, 50] }, { "punto": [55.21, 30.24] }, { "punto": [103.2, -2.9] }, { "punto": [104.6, 3.8] }, { "punto": [58.9, 36.2] }] }
    ],

    "accesos": [
      {
        "id": "NO",
        "nombre": "Carrera 15",
        "etiquetas": ["Carrera 15"],
        "posEtiqueta": [20, 7],
        "nota": "Embudo entre el borde oeste (30,0)→(26,48), tangente al anillo a las 9:00, y el borde este (37,0)→(51,26), tangente a las 12:30. Calzada oeste: 2 carriles que bajan (↓) a la glorieta (con carril virtual de filtrado de motos entre ambos). Calzada este: 1 carril que sube (↑) desde el anillo.",
        "entradas": [
          { "curva": "C15_oeste", "desplazamiento": -5.0 },
          { "curva": "C15_oeste", "desplazamiento": -1.8 }
        ],
        "salida": { "curva": "C15_este", "desplazamiento": 1.8, "invertir": true, "desdeCarriles": [1] }
      },
      {
        "id": "S",
        "nombre": "Carrera 15 Sur",
        "etiquetas": ["Carrera 15 Sur"],
        "posEtiqueta": [7, 74],
        "nota": "Continuación sin quiebre del borde oeste de la Carrera 15: desde las 9:00 (26,50) baja en diagonal hasta (10,100). Solo salida (↙), por debajo del costado oeste de la calzada superior del puente.",
        "salida": { "curva": "C15S_oeste", "desplazamiento": -1.9 }
      },
      {
        "id": "NE",
        "nombre": "Calle 40 / Paralela",
        "etiquetas": ["Calle 40 / Paralela"],
        "posEtiqueta": [77, 6],
        "nota": "Dos bordes paralelos a ~25°, por encima del puente: superior (57,29)→(99,0) y inferior (62,34)→(100,7). Carril superior entra (↙); carril inferior sale (↗).",
        "entradas": [{ "curva": "C40_norte", "desplazamiento": 1.85, "invertir": true }],
        "salida": { "curva": "C40_sur", "desplazamiento": -1.85 },
        "anguloEntrada": { "externo": 13, "interno": 22 },
        "anguloSalida": { "externo": 10, "interno": 20 }
      },
      {
        "id": "E",
        "nombre": "Corredor Este",
        "etiquetas": ["Corredor Este"],
        "posEtiqueta": [88, 58],
        "nota": "Ramal medio-derecho (100,43)→3:00 (65,47): entra a la glorieta (←). Salida (→) por la línea continua inferior desde las 5:00 hasta (100,48). Entre ambos y el arco 3:00–5:00 queda la isleta triangular grande.",
        "entradas": [{ "curva": "E_entrada" }],
        "salida": { "curva": "corredor", "inicio": [64.7, 63.5] },
        "anguloEntrada": { "externo": 10, "interno": 18 },
        "anguloSalida": { "externo": 20, "interno": 32 }
      },
      {
        "id": "SE",
        "nombre": "Corredor inferior",
        "etiquetas": ["Corredor inferior"],
        "posEtiqueta": [46, 95],
        "nota": "Línea continua inferior: entra en (33,100), sube en diagonal y roza tangencialmente el anillo entre las 5:45 y las 5:00. Un solo carril que se divide en la línea de ceda: quien va al anillo entra cediendo el paso; quien va al Este (giro libre) sigue de largo por el corredor rozando el anillo y cede al unirse a la salida Este.",
        "entradas": [{ "curva": "corredor" }],
        "ramal": { "curva": "corredor", "hacia": "E", "compartirEntrada": 0 },
        "anguloEntrada": { "externo": 10, "interno": 18 }
      },
      {
        "id": "SI",
        "nombre": "Ramal inferior",
        "etiquetas": ["Ramal inferior"],
        "posEtiqueta": [36.5, 86],
        "nota": "Nace en la base del anillo a las 6:30 (41,74) y baja en diagonal empinada hasta (28,100), justo bajo la calzada inferior del puente. Solo salida (↓). Entre este ramal, el corredor inferior y el arco sur queda la isleta triangular pequeña.",
        "salida": { "curva": "SI_salida" },
        "anguloSalida": { "externo": 18, "interno": 30 }
      }
    ],

    "puente": {
      "nombre": "Puente Ruta 90",
      "nivel": 2,
      "carrilesPorSentido": 2,
      "anchoCarril": 3.2,
      "baranda": 0.4,
      "calzadas": [
        { "id": "sup", "nombre": "Calzada superior (NE → SO)", "puntos": [[100, 13], [60.02, 39.16], [47.33, 52.2], [33.21, 67.68], [15, 100]] },
        { "id": "inf", "nombre": "Calzada inferior (SO → NE)", "puntos": [[22, 100], [40.69, 74.15], [55.33, 55], [61.58, 47.52], [100, 23]] }
      ]
    },

    "arboles": [[72, 52.2], [77, 50.5], [83, 48.8]]
  },
  conteos: {
    "descripcion": "Aforo por bloques de 5 minutos en los accesos de ENTRADA de la Glorieta de La Lucha (NO = Carrera 15 ↓, NE = Calle 40 / Paralela ↙, SE = Corredor inferior ↗, E = Corredor Este ←). Los de SE que van al Este siguen de largo por el corredor sin entrar al anillo. Carrera 15 Sur (S) y el Ramal inferior (SI) solo reciben vehículos. Datos calibrados base: ~55% motos, 35% carros, 10% busetas; valle ≈ 45% del pico. Reemplazar cualquier cifra con el conteo real del equipo.",
    "unidades": "vehículos por intervalo",
    "intervaloMin": 5,
    "perfilActivo": "pico",
    "perfiles": {
      "pico": {
        "nombre": "Hora pico (17:00–17:15)",
        "intervalos": [
          { "inicio": "17:00", "NO": { "moto": 39, "carro": 24, "buseta": 7 }, "NE": { "moto": 21, "carro": 14, "buseta": 4 }, "SE": { "moto": 21, "carro": 13, "buseta": 4 }, "E": { "moto": 13, "carro": 8, "buseta": 2 } },
          { "inicio": "17:05", "NO": { "moto": 41, "carro": 26, "buseta": 8 }, "NE": { "moto": 23, "carro": 15, "buseta": 4 }, "SE": { "moto": 22, "carro": 14, "buseta": 4 }, "E": { "moto": 14, "carro": 9, "buseta": 3 } },
          { "inicio": "17:10", "NO": { "moto": 40, "carro": 26, "buseta": 7 }, "NE": { "moto": 22, "carro": 15, "buseta": 4 }, "SE": { "moto": 21, "carro": 14, "buseta": 4 }, "E": { "moto": 13, "carro": 9, "buseta": 2 } }
        ]
      },
      "valle": {
        "nombre": "Hora valle (10:00–10:15)",
        "intervalos": [
          { "inicio": "10:00", "NO": { "moto": 17, "carro": 12, "buseta": 3 }, "NE": { "moto": 10, "carro": 6, "buseta": 2 }, "SE": { "moto": 9, "carro": 6, "buseta": 2 }, "E": { "moto": 6, "carro": 4, "buseta": 1 } },
          { "inicio": "10:05", "NO": { "moto": 19, "carro": 12, "buseta": 3 }, "NE": { "moto": 10, "carro": 7, "buseta": 2 }, "SE": { "moto": 10, "carro": 6, "buseta": 2 }, "E": { "moto": 6, "carro": 4, "buseta": 1 } },
          { "inicio": "10:10", "NO": { "moto": 18, "carro": 12, "buseta": 3 }, "NE": { "moto": 10, "carro": 7, "buseta": 2 }, "SE": { "moto": 10, "carro": 5, "buseta": 2 }, "E": { "moto": 6, "carro": 4, "buseta": 1 } }
        ]
      }
    },
    "destinos": {
      "nota": "Proporción de vehículos de cada entrada que sale por cada acceso (suma 1). Salidas: NO = Carrera 15 (↑), S = Carrera 15 Sur (↙), SI = Ramal inferior (↓), E = Corredor Este (→), NE = Calle 40 / Paralela (↗). Los del Corredor inferior (SE) que van al Este (E) siguen de largo por el corredor sin entrar al anillo.",
      "NO": { "S": 0.45, "SI": 0.15, "E": 0.28, "NE": 0.12 },
      "NE": { "S": 0.4, "SI": 0.15, "E": 0.25, "NO": 0.2 },
      "SE": { "E": 0.45, "NO": 0.25, "NE": 0.15, "S": 0.15 },
      "E": { "NO": 0.35, "NE": 0.15, "S": 0.35, "SI": 0.15 }
    },
    "puente": {
      "nota": "Tráfico de paso por el Puente Ruta 90 (nivel 2): calzada superior NE → SO (↙) y calzada inferior SO → NE (↗), cada una con 2 carriles. Pasa por encima del cuadrante sureste del anillo y de la isla central; no interactúa con el nivel 1 y no entra en las métricas.",
      "unidades": "veh/h por sentido",
      "pico": 1800,
      "valle": 900,
      "mezcla": { "moto": 0.35, "carro": 0.45, "buseta": 0.2 }
    }
  },
  parametros: {
    "simulacion": { "dt": 0.1, "semilla": 2026, "minutosComparacion": 15, "_unidades": { "dt": "s", "minutosComparacion": "min" } },
    "vehiculos": {
      "moto": {
        "largo": 2.0, "ancho": 0.8, "velDeseada": 11.1, "acelMax": 3.0, "decelComoda": 3.5, "decelMax": 7.0, "distMinima": 1.0, "tiempoSeguimiento": 0.8,
        "_unidades": { "largo": "m", "ancho": "m", "velDeseada": "m/s", "acelMax": "m/s²", "decelComoda": "m/s²", "decelMax": "m/s²", "distMinima": "m", "tiempoSeguimiento": "s" }
      },
      "carro": {
        "largo": 4.5, "ancho": 1.8, "velDeseada": 11.1, "acelMax": 2.0, "decelComoda": 3.0, "decelMax": 7.5, "distMinima": 2.0, "tiempoSeguimiento": 1.4,
        "_unidades": { "largo": "m", "ancho": "m", "velDeseada": "m/s", "acelMax": "m/s²", "decelComoda": "m/s²", "decelMax": "m/s²", "distMinima": "m", "tiempoSeguimiento": "s" }
      },
      "buseta": {
        "largo": 8.5, "ancho": 2.4, "velDeseada": 9.7, "acelMax": 1.2, "decelComoda": 2.5, "decelMax": 6.0, "distMinima": 2.5, "tiempoSeguimiento": 1.6,
        "_unidades": { "largo": "m", "ancho": "m", "velDeseada": "m/s", "acelMax": "m/s²", "decelComoda": "m/s²", "decelMax": "m/s²", "distMinima": "m", "tiempoSeguimiento": "s" }
      }
    },
    "motos": {
      "filtrado": true, "brechaFiltrado": 1.5, "velMaxFiltrado": 5.0, "distanciaInicioFiltrado": 12,
      "_unidades": { "filtrado": "booleano", "brechaFiltrado": "m", "velMaxFiltrado": "m/s", "distanciaInicioFiltrado": "m" }
    },
    "control": {
      "modoInicial": "actual",
      "distanciaDecision": 25,
      "actual": { "brechaCritica": 3.5, "_unidades": { "brechaCritica": "s" } },
      "semaforo": {
        "verdeNO": 28, "verdeSE": 16, "verdeE": 14, "verdeNE": 18, "amarillo": 3, "todoRojo": 2,
        "_unidades": { "verdeNO": "s", "verdeSE": "s", "verdeE": "s", "verdeNE": "s", "amarillo": "s", "todoRojo": "s" }
      },
      "alternativa": {
        "turnoMaximo": 40, "turnoMinimo": 5, "colaVaciado": 2, "despeje": 0, "orden": ["NO", "SE", "E", "NE"],
        "_nota": "Agente por demanda: da paso a la entrada con más vehículos esperando (ignora las vacías) y mantiene el turno hasta que su cola baja a colaVaciado o se cumple turnoMaximo. orden solo desempata (y fija la secuencia del semáforo).",
        "_unidades": { "turnoMaximo": "s", "turnoMinimo": "s", "colaVaciado": "veh", "despeje": "s" }
      },
      "_unidades": { "distanciaDecision": "m" }
    },
    "metricas": {
      "ventanaCapacidad": 60, "umbralVelocidadCola": 1.0,
      "_unidades": { "ventanaCapacidad": "s", "umbralVelocidadCola": "m/s" }
    }
  },
};
