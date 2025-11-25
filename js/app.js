 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/js/app.js b/js/app.js
index aebaac9c12e35b9c740fb8626041657df058b10e..5dbabb70219d122400da85a6a0965ffc7618a659 100644
--- a/js/app.js
+++ b/js/app.js
@@ -1,62 +1,65 @@
 // app.js v0.5
 // - Generación de fixture (liga / zonas / eliminación)
 // - Scheduler básico
 // - Vistas por zona / día / cancha / equipo
 // - Exportar CSV, PNG, PDF (texto con jsPDF + autoTable)
 // - Playoffs automáticos desde zonas con IDs de partido (P1, P2...) y refs GP / PP
 
+// Marca visible de build para que sea fácil saber si la versión desplegada es la más reciente
+const APP_BUILD_STAMP = "v0.3 · Actualizado 2025-05-19 (Evita 21 equipos)";
+
 // =====================
 //  ESTADO GLOBAL
 // =====================
 // =====================
-// MODELOS EVITA (24 equipos)
+// MODELOS EVITA (21–24 equipos)
 // =====================
 
 
 const EVITA_MODELS = {
   EVITA_24_8x3_NORMAL_5D_2C: {
     id: "EVITA_24_8x3_NORMAL_5D_2C",
-    nombre: "24 equipos · 8×3 · 5 días · 2 canchas (normal)",
+    nombre: "21–24 equipos · 7–8×3 · 5 días · 2 canchas (normal)",
     descripcion:
-      "Modelo Evita con 8 zonas de 3 equipos, fase de zonas, grupos A1/A2 y definición de puestos 1 al 24.",
+      "Modelo Evita con 7 u 8 zonas de 3 equipos, fase de zonas, grupos A1/A2 y definición de puestos 1 al 24.",
 
     // Metadatos básicos del modelo
     meta: {
-      equiposEsperados: 24,
-      estructuraZonas: "8x3",        // 8 zonas de 3
+      equiposEsperados: { min: 21, max: 24 },
+      estructuraZonas: "7-8x3",        // 7 u 8 zonas de 3
       diasRecomendados: 5,
       canchasRecomendadas: 2,
       // En el futuro podemos usar esto para advertir si faltan/e sobran equipos, días, etc.
     },
 
     // Fases deportivas declaradas (todavía no se usan al 100%, pero nos sirven como "mapa")
     fases: [
       {
         id: "F1_ZONAS",
         tipo: "zonas-roundrobin",
-        etiqueta: "Fase 1 · Zonas 8×3",
+        etiqueta: "Fase 1 · Zonas 7–8×3",
       },
       {
         id: "F2_A1A2",
         tipo: "grupos-1ros",
         etiqueta: "Fase 2 · A1 y A2 (1° de zonas)",
       },
       {
         id: "F3_9_16",
         tipo: "llaves-2dos",
         etiqueta: "Puestos 9 a 16 (2° de zonas)",
       },
       {
         id: "F4_17_24",
         tipo: "llaves-3ros",
         etiqueta: "Puestos 17 a 24 (3° de zonas)",
       },
       {
         id: "F5_1_8",
         tipo: "finales-1-8",
         etiqueta: "Puestos 1 a 8 (1°–4°)",
       },
     ],
 
     // Pistas de programación por bloques (zonas al inicio, finales al final, etc.)
     programacion: {
@@ -990,222 +993,248 @@ function generarLigaSeeds(seedLabels, options) {
     const vuelta = fixtures.map((m) => ({
       id: safeId("m"),
       code: null,
       zone: m.zone,
       homeTeamId: null,
       awayTeamId: null,
       homeSeed: m.awaySeed,
       awaySeed: m.homeSeed,
       fromHomeMatchCode: null,
       fromHomeResult: null,
       fromAwayMatchCode: null,
       fromAwayResult: null,
       date: null,
       time: null,
       fieldId: null,
       round: m.round + rondas,
       phase: phase + "-vuelta",
     }));
     return fixtures.concat(vuelta);
   }
 
   return fixtures;
 }
 
 // =====================
-//  FORMATO ESPECIAL 8x3 (22–24 EQUIPOS)
+//  FORMATO ESPECIAL 8x3 (21–24 EQUIPOS)
 // =====================
-//  FORMATO ESPECIAL 8x3 (22–24 EQUIPOS)
+//  FORMATO ESPECIAL 8x3 (21–24 EQUIPOS)
 //  - 24 equipos: 8 zonas de 3
 //  - 23 equipos: 7 zonas de 3 + 1 zona de 2 (ida y vuelta en la de 2)
 //  - 22 equipos: 6 zonas de 3 + 2 zonas de 2 (ida y vuelta en las de 2)
 //  - Llave C (puestos 17–24) respeta estructura de 24 provincias.
 //    · 23 equipos  → 1 BYE en el primer cruce (mejor 3°).
 //    · 22 equipos  → 2 BYE en el primer cruce (dos mejores 3°).
 // =====================
 function generarEspecial8x3(t) {
   // Construimos el mapa de zonas desde los equipos
   const zonesMap = {};
   const teamsWithZone = new Set();
   t.teams.forEach((team) => {
     const z = (team.zone || "").trim();
     if (!z) return;
     if (!zonesMap[z]) zonesMap[z] = [];
     zonesMap[z].push(team.id);
     teamsWithZone.add(team.id);
   });
 
+  const totalEquipos = t.teams.length;
+
   const zoneNames = Object.keys(zonesMap).sort((a, b) =>
     a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })
   );
 
-  // Siempre trabajamos con 8 zonas (Z1..Z8)
-  if (zoneNames.length !== 8) {
+  const zonasEsperadas = totalEquipos === 21 ? 7 : 8;
+
+  // Siempre trabajamos con 8 zonas (Z1..Z8), salvo el caso de 21 equipos (7 zonas)
+  if (zoneNames.length !== zonasEsperadas) {
     alert(
-      "El formato especial 8×3 requiere exactamente 8 zonas.\n" +
+      "El formato especial 8×3 requiere exactamente " +
+        zonasEsperadas +
+        " zonas.\n" +
         "Actualmente se detectan " +
         zoneNames.length +
         " zonas. Verificá la columna 'Zona' de los equipos."
     );
     return [];
   }
 
   // Conteo de equipos por zona
   let totalEnZonas = 0;
   let zonasCon3 = 0;
   let zonasCon2 = 0;
   const zonasInvalidas = [];
 
   for (const z of zoneNames) {
     const count = zonesMap[z].length;
     totalEnZonas += count;
     if (count === 3) {
       zonasCon3++;
     } else if (count === 2) {
       zonasCon2++;
     } else {
       zonasInvalidas.push({ zona: z, count });
     }
   }
 
-  const totalEquipos = t.teams.length;
-
   // Sólo se permiten zonas de 2 o 3 equipos
   if (zonasInvalidas.length) {
     const detalle = zonasInvalidas
       .map((zi) => " - Zona '" + zi.zona + "': " + zi.count + " equipos")
       .join("\n");
     alert(
       "En el formato especial 8×3 sólo se permiten zonas de 2 o 3 equipos.\n" +
         "Revisá estas zonas:\n" +
         detalle
     );
     return [];
   }
 
   // Combinaciones admitidas según el manual EVITA
   if (totalEquipos === 24) {
     if (zonasCon3 !== 8 || zonasCon2 !== 0) {
       alert(
         "Para 24 equipos el formato especial 8×3 requiere 8 zonas de 3 equipos.\n" +
           "Detectadas: " +
           zonasCon3 +
           " zonas de 3 y " +
           zonasCon2 +
           " zonas de 2."
       );
       return [];
     }
   } else if (totalEquipos === 23) {
     if (zonasCon3 !== 7 || zonasCon2 !== 1) {
       alert(
         "Para 23 equipos el formato especial 8×3 requiere 7 zonas de 3 equipos y 1 zona de 2 equipos.\n" +
           "Detectadas: " +
           zonasCon3 +
           " zonas de 3 y " +
           zonasCon2 +
           " zonas de 2."
       );
       return [];
     }
   } else if (totalEquipos === 22) {
     if (zonasCon3 !== 6 || zonasCon2 !== 2) {
       alert(
         "Para 22 equipos el formato especial 8×3 requiere 6 zonas de 3 equipos y 2 zonas de 2 equipos.\n" +
           "Detectadas: " +
           zonasCon3 +
           " zonas de 3 y " +
           zonasCon2 +
           " zonas de 2."
       );
       return [];
     }
+  } else if (totalEquipos === 21) {
+    if (zonasCon3 !== 7 || zonasCon2 !== 0) {
+      alert(
+        "Para 21 equipos el formato especial 8×3 requiere 7 zonas de 3 equipos.\n" +
+          "Detectadas: " +
+          zonasCon3 +
+          " zonas de 3 y " +
+          zonasCon2 +
+          " zonas de 2."
+      );
+      return [];
+    }
   } else {
     alert(
-      "Por ahora el formato especial 8×3 está preparado sólo para 22, 23 o 24 equipos.\n" +
+      "Por ahora el formato especial 8×3 está preparado sólo para 21, 22, 23 o 24 equipos.\n" +
         "Equipos detectados en zonas: " +
         totalEquipos +
         "."
     );
     return [];
   }
 
   if (totalEnZonas !== totalEquipos) {
     alert(
-      "Hay equipos sin zona asignada o con una zona distinta de las 8 definidas.\n" +
+      "Hay equipos sin zona asignada o con una zona distinta de las " +
+        zonasEsperadas +
+        " definidas.\n" +
         "Equipos totales: " +
         totalEquipos +
         " · Equipos en zonas válidas: " +
         totalEnZonas +
         "."
     );
     return [];
   }
 
   const idaVueltaGlobal = !!(
     t.format &&
     t.format.liga &&
     t.format.liga.rounds === "ida-vuelta"
   );
 
   const allMatches = [];
 
   // ---------------------
-  // FASE 1: ZONAS INICIALES (8×3, con ida y vuelta en zonas de 2)
+  // FASE 1: ZONAS INICIALES (7–8×3, con ida y vuelta en zonas de 2)
   // ---------------------
   const fase1 = [];
+  const fase1Label =
+    zonasEsperadas === 7
+      ? "Fase 1 · zonas (7×3)"
+      : "Fase 1 · zonas (8×3)";
+
   zoneNames.forEach((z) => {
     const ids = zonesMap[z];
     if (!Array.isArray(ids) || ids.length < 2) return;
 
     const esZonaDe2 = ids.length === 2;
     const idaVueltaZona = esZonaDe2 ? true : idaVueltaGlobal;
 
     const part = generarFixtureLiga(ids, {
       idaVuelta: idaVueltaZona,
       zone: z,
-      phase: "Fase 1 · zonas (8×3)",
+      phase: fase1Label,
     });
     fase1.push(...part);
   });
   allMatches.push(...fase1);
 
   // ---------------------
   // FASE 2: ZONAS A1 y A2 (1° de cada zona)
   // ---------------------
   const z1 = zoneNames[0];
   const z2 = zoneNames[1];
   const z3 = zoneNames[2];
   const z4 = zoneNames[3];
   const z5 = zoneNames[4];
   const z6 = zoneNames[5];
   const z7 = zoneNames[6];
   const z8 = zoneNames[7];
 
-  // Seeds de los mejores 1°: 1°1° .. 8°1°
-const seedsA1 = ["1°1°", "4°1°", "5°1°", "8°1°"];
-const seedsA2 = ["2°1°", "3°1°", "6°1°", "7°1°"];
+  // Seeds de los mejores 1°: 1°1° .. 8°1° (o 7°1° + 1°2° si hay 21 equipos)
+  const seedsA1 =
+    totalEquipos === 21
+      ? ["1°1°", "4°1°", "5°1°", "1°2°"]
+      : ["1°1°", "4°1°", "5°1°", "8°1°"];
+  const seedsA2 = ["2°1°", "3°1°", "6°1°", "7°1°"];
 
   const zonaA1 = generarLigaSeeds(seedsA1, {
     idaVuelta: idaVueltaGlobal,
     zone: "Zona A1",
     phase: "Fase 2 · Zona A1 (1° de zonas)",
   });
   const zonaA2 = generarLigaSeeds(seedsA2, {
     idaVuelta: idaVueltaGlobal,
     zone: "Zona A2",
     phase: "Fase 2 · Zona A2 (1° de zonas)",
   });
 
   allMatches.push(...zonaA1, ...zonaA2);
 
   // ---------------------
   // FASE 3: PUESTOS 1–8 (cruce A1 vs A2)
   // ---------------------
   function crearPartidoPosicion(posicion) {
     return {
       id: safeId("m"),
       code: null,
       zone: "Puestos 1-8",
       homeTeamId: null,
       awayTeamId: null,
       homeSeed: posicion + "° Zona A1",
@@ -1261,226 +1290,362 @@ const seedsA2 = ["2°1°", "3°1°", "6°1°", "7°1°"];
     fromResAway,
     round,
     phase,
     zone
   ) {
     return {
       id: safeId("m"),
       code: code,
       zone: zone,
       homeTeamId: null,
       awayTeamId: null,
       homeSeed: fromResHome + " " + fromCodeHome,
       awaySeed: fromResAway + " " + fromCodeAway,
       fromHomeMatchCode: fromCodeHome,
       fromHomeResult: fromResHome,
       fromAwayMatchCode: fromCodeAway,
       fromAwayResult: fromResAway,
       date: null,
       time: null,
       fieldId: null,
       round: round,
       phase: phase,
     };
   }
 
- const phase9_16 = "Puestos 9-16";
-const zone9_16 = "Puestos 9-16";
-
-// Ronda 1 (mejores 2° con nuevo patrón)
-const m9_1 = crearMatchClasif(
-  "P9_1",
-  "1°2°",
-  "8°2°",
-  1,
-  phase9_16,
-  zone9_16
-);
-const m9_2 = crearMatchClasif(
-  "P9_2",
-  "4°2°",
-  "5°2°",
-  1,
-  phase9_16,
-  zone9_16
-);
-const m9_3 = crearMatchClasif(
-  "P9_3",
-  "3°2°",
-  "6°2°",
-  1,
-  phase9_16,
-  zone9_16
-);
-const m9_4 = crearMatchClasif(
-  "P9_4",
-  "2°2°",
-  "7°2°",
-  1,
-  phase9_16,
-  zone9_16
-);
-
-  // Ronda 2 (ganadores y perdedores)
-  const m9_5 = crearMatchDesdeGP_PP(
-    "P9_5",
-    m9_1.code,
-    "GP",
-    m9_2.code,
-    "GP",
-    2,
-    phase9_16,
-    zone9_16
-  );
-  const m9_6 = crearMatchDesdeGP_PP(
-    "P9_6",
-    m9_3.code,
-    "GP",
-    m9_4.code,
-    "GP",
-    2,
-    phase9_16,
-    zone9_16
-  );
-  const m9_7 = crearMatchDesdeGP_PP(
-    "P9_7",
-    m9_1.code,
-    "PP",
-    m9_2.code,
-    "PP",
-    2,
-    phase9_16,
-    zone9_16
-  );
-  const m9_8 = crearMatchDesdeGP_PP(
-    "P9_8",
-    m9_3.code,
-    "PP",
-    m9_4.code,
-    "PP",
-    2,
-    phase9_16,
-    zone9_16
-  );
+  const phase9_16 = "Puestos 9-16";
+  const zone9_16 = "Puestos 9-16";
+
+  if (totalEquipos === 21) {
+    // Sembrado especial: 2°2° y 1°3° reemplazan al 1°2° que sube a A1
+    const m9_1 = crearMatchClasif(
+      "P9_1",
+      "2°2°",
+      "2°3°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_2 = crearMatchClasif(
+      "P9_2",
+      "5°2°",
+      "6°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_3 = crearMatchClasif(
+      "P9_3",
+      "4°2°",
+      "7°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_4 = crearMatchClasif(
+      "P9_4",
+      "1°3°",
+      "3°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
 
-  // Ronda 3 (definición de 9–16)
-  const m9_9 = crearMatchDesdeGP_PP(
-    "P9_9",
-    m9_5.code,
-    "GP",
-    m9_6.code,
-    "GP",
-    3,
-    phase9_16,
-    zone9_16
-  );
-  const m9_10 = crearMatchDesdeGP_PP(
-    "P9_10",
-    m9_5.code,
-    "PP",
-    m9_6.code,
-    "PP",
-    3,
-    phase9_16,
-    zone9_16
-  );
-  const m9_11 = crearMatchDesdeGP_PP(
-    "P9_11",
-    m9_7.code,
-    "GP",
-    m9_8.code,
-    "GP",
-    3,
-    phase9_16,
-    zone9_16
-  );
-  const m9_12 = crearMatchDesdeGP_PP(
-    "P9_12",
-    m9_7.code,
-    "PP",
-    m9_8.code,
-    "PP",
-    3,
-    phase9_16,
-    zone9_16
-  );
+    // Ronda 2 (ganadores y perdedores)
+    const m9_5 = crearMatchDesdeGP_PP(
+      "P9_5",
+      m9_1.code,
+      "GP",
+      m9_2.code,
+      "GP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_6 = crearMatchDesdeGP_PP(
+      "P9_6",
+      m9_3.code,
+      "GP",
+      m9_4.code,
+      "GP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_7 = crearMatchDesdeGP_PP(
+      "P9_7",
+      m9_1.code,
+      "PP",
+      m9_2.code,
+      "PP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_8 = crearMatchDesdeGP_PP(
+      "P9_8",
+      m9_3.code,
+      "PP",
+      m9_4.code,
+      "PP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+
+    // Ronda 3 (definición de 9–16)
+    const m9_9 = crearMatchDesdeGP_PP(
+      "P9_9",
+      m9_5.code,
+      "GP",
+      m9_6.code,
+      "GP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_10 = crearMatchDesdeGP_PP(
+      "P9_10",
+      m9_5.code,
+      "PP",
+      m9_6.code,
+      "PP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_11 = crearMatchDesdeGP_PP(
+      "P9_11",
+      m9_7.code,
+      "GP",
+      m9_8.code,
+      "GP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_12 = crearMatchDesdeGP_PP(
+      "P9_12",
+      m9_7.code,
+      "PP",
+      m9_8.code,
+      "PP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+
+    allMatches.push(
+      m9_1,
+      m9_2,
+      m9_3,
+      m9_4,
+      m9_5,
+      m9_6,
+      m9_7,
+      m9_8,
+      m9_9,
+      m9_10,
+      m9_11,
+      m9_12
+    );
+  } else {
+    // Ronda 1 (mejores 2° con nuevo patrón)
+    const m9_1 = crearMatchClasif(
+      "P9_1",
+      "1°2°",
+      "8°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_2 = crearMatchClasif(
+      "P9_2",
+      "4°2°",
+      "5°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_3 = crearMatchClasif(
+      "P9_3",
+      "3°2°",
+      "6°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+    const m9_4 = crearMatchClasif(
+      "P9_4",
+      "2°2°",
+      "7°2°",
+      1,
+      phase9_16,
+      zone9_16
+    );
+
+    // Ronda 2 (ganadores y perdedores)
+    const m9_5 = crearMatchDesdeGP_PP(
+      "P9_5",
+      m9_1.code,
+      "GP",
+      m9_2.code,
+      "GP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_6 = crearMatchDesdeGP_PP(
+      "P9_6",
+      m9_3.code,
+      "GP",
+      m9_4.code,
+      "GP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_7 = crearMatchDesdeGP_PP(
+      "P9_7",
+      m9_1.code,
+      "PP",
+      m9_2.code,
+      "PP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+    const m9_8 = crearMatchDesdeGP_PP(
+      "P9_8",
+      m9_3.code,
+      "PP",
+      m9_4.code,
+      "PP",
+      2,
+      phase9_16,
+      zone9_16
+    );
+
+    // Ronda 3 (definición de 9–16)
+    const m9_9 = crearMatchDesdeGP_PP(
+      "P9_9",
+      m9_5.code,
+      "GP",
+      m9_6.code,
+      "GP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_10 = crearMatchDesdeGP_PP(
+      "P9_10",
+      m9_5.code,
+      "PP",
+      m9_6.code,
+      "PP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_11 = crearMatchDesdeGP_PP(
+      "P9_11",
+      m9_7.code,
+      "GP",
+      m9_8.code,
+      "GP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+    const m9_12 = crearMatchDesdeGP_PP(
+      "P9_12",
+      m9_7.code,
+      "PP",
+      m9_8.code,
+      "PP",
+      3,
+      phase9_16,
+      zone9_16
+    );
+
+    allMatches.push(
+      m9_1,
+      m9_2,
+      m9_3,
+      m9_4,
+      m9_5,
+      m9_6,
+      m9_7,
+      m9_8,
+      m9_9,
+      m9_10,
+      m9_11,
+      m9_12
+    );
+  }
 
-  allMatches.push(
-    m9_1,
-    m9_2,
-    m9_3,
-    m9_4,
-    m9_5,
-    m9_6,
-    m9_7,
-    m9_8,
-    m9_9,
-    m9_10,
-    m9_11,
-    m9_12
-  );
 
   // ---------------------
   // FASE 5: PUESTOS 17–24 (3° de zonas / mejores 3°)
   // ---------------------
   const phase17_24 = "Puestos 17-24";
   const zone17_24 = "Puestos 17-24";
 
-if (totalEquipos === 24) {
-  // Caso base: 8 terceros, sin BYE (mejores 3° con nuevo patrón)
-  const m17_1 = crearMatchClasif(
-    "P17_1",
-    "1°3°",
-    "8°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  const m17_2 = crearMatchClasif(
-    "P17_2",
-    "4°3°",
-    "5°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  const m17_3 = crearMatchClasif(
-    "P17_3",
-    "3°3°",
-    "6°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  const m17_4 = crearMatchClasif(
-    "P17_4",
-    "2°3°",
-    "7°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
+  if (totalEquipos === 24) {
+    // Caso base: 8 terceros, sin BYE (mejores 3° con nuevo patrón)
+    const m17_1 = crearMatchClasif(
+      "P17_1",
+      "1°3°",
+      "8°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    const m17_2 = crearMatchClasif(
+      "P17_2",
+      "4°3°",
+      "5°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    const m17_3 = crearMatchClasif(
+      "P17_3",
+      "3°3°",
+      "6°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    const m17_4 = crearMatchClasif(
+      "P17_4",
+      "2°3°",
+      "7°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
 
     const m17_5 = crearMatchDesdeGP_PP(
       "P17_5",
       m17_1.code,
       "GP",
       m17_2.code,
       "GP",
       2,
       phase17_24,
       zone17_24
     );
     const m17_6 = crearMatchDesdeGP_PP(
       "P17_6",
       m17_3.code,
       "GP",
       m17_4.code,
       "GP",
       2,
       phase17_24,
       zone17_24
     );
     const m17_7 = crearMatchDesdeGP_PP(
       "P17_7",
       m17_1.code,
       "PP",
@@ -1534,238 +1699,237 @@ if (totalEquipos === 24) {
     const m17_12 = crearMatchDesdeGP_PP(
       "P17_12",
       m17_7.code,
       "PP",
       m17_8.code,
       "PP",
       3,
       phase17_24,
       zone17_24
     );
 
     allMatches.push(
       m17_1,
       m17_2,
       m17_3,
       m17_4,
       m17_5,
       m17_6,
       m17_7,
       m17_8,
       m17_9,
       m17_10,
       m17_11,
       m17_12
     );
-} else if (totalEquipos === 23) {
-  // 7 terceros + 1 BYE (el 1°3° pasa directo)
-  // Patrón pedido:
-  // 1°3° vs BYE
-  // 7°3° vs 4°3°
-  // 3°3° vs 5°3°
-  // 2°3° vs 6°3°
-
-  // Partido con BYE: 1°3° clasifica directo
-  const m17_1 = crearMatchClasif(
-    "P17_1",
-    "1°3°",
-    "BYE (1°3°)",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  m17_1.isByeMatch = true;
-
-  const m17_2 = crearMatchClasif(
-    "P17_2",
-    "7°3°",
-    "4°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  const m17_3 = crearMatchClasif(
-    "P17_3",
-    "3°3°",
-    "5°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  const m17_4 = crearMatchClasif(
-    "P17_4",
-    "2°3°",
-    "6°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
+  } else if (totalEquipos === 23) {
+    // 7 terceros + 1 BYE (el 1°3° pasa directo)
+    // Patrón pedido:
+    // 1°3° vs BYE
+    // 7°3° vs 4°3°
+    // 3°3° vs 5°3°
+    // 2°3° vs 6°3°
+
+    // Partido con BYE: 1°3° clasifica directo
+    const m17_1 = crearMatchClasif(
+      "P17_1",
+      "1°3°",
+      "BYE (1°3°)",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_1.isByeMatch = true;
 
-  // Ronda 2 (semis y reclasif) – misma estructura GP/PP
-  const m17_5 = crearMatchDesdeGP_PP(
-    "P17_5",
-    m17_1.code,
-    "GP",
-    m17_2.code,
-    "GP",
-    2,
-    phase17_24,
-    zone17_24
-  );
-  const m17_6 = crearMatchDesdeGP_PP(
-    "P17_6",
-    m17_3.code,
-    "GP",
-    m17_4.code,
-    "GP",
-    2,
-    phase17_24,
-    zone17_24
-  );
-  const m17_7 = crearMatchDesdeGP_PP(
-    "P17_7",
-    m17_1.code,
-    "PP",
-    m17_2.code,
-    "PP",
-    2,
-    phase17_24,
-    zone17_24
-  );
-  const m17_8 = crearMatchDesdeGP_PP(
-    "P17_8",
-    m17_3.code,
-    "PP",
-    m17_4.code,
-    "PP",
-    2,
-    phase17_24,
-    zone17_24
-  );
+    const m17_2 = crearMatchClasif(
+      "P17_2",
+      "7°3°",
+      "4°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    const m17_3 = crearMatchClasif(
+      "P17_3",
+      "3°3°",
+      "5°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    const m17_4 = crearMatchClasif(
+      "P17_4",
+      "2°3°",
+      "6°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
 
-  // Ronda 3 (definiciones 17–24)
-  const m17_9 = crearMatchDesdeGP_PP(
-    "P17_9",
-    m17_5.code,
-    "GP",
-    m17_6.code,
-    "GP",
-    3,
-    phase17_24,
-    zone17_24
-  );
-  const m17_10 = crearMatchDesdeGP_PP(
-    "P17_10",
-    m17_5.code,
-    "PP",
-    m17_6.code,
-    "PP",
-    3,
-    phase17_24,
-    zone17_24
-  );
-  const m17_11 = crearMatchDesdeGP_PP(
-    "P17_11",
-    m17_7.code,
-    "GP",
-    m17_8.code,
-    "GP",
-    3,
-    phase17_24,
-    zone17_24
-  );
-  const m17_12 = crearMatchDesdeGP_PP(
-    "P17_12",
-    m17_7.code,
-    "PP",
-    m17_8.code,
-    "PP",
-    3,
-    phase17_24,
-    zone17_24
-  );
+    // Ronda 2 (semis y reclasif) – misma estructura GP/PP
+    const m17_5 = crearMatchDesdeGP_PP(
+      "P17_5",
+      m17_1.code,
+      "GP",
+      m17_2.code,
+      "GP",
+      2,
+      phase17_24,
+      zone17_24
+    );
+    const m17_6 = crearMatchDesdeGP_PP(
+      "P17_6",
+      m17_3.code,
+      "GP",
+      m17_4.code,
+      "GP",
+      2,
+      phase17_24,
+      zone17_24
+    );
+    const m17_7 = crearMatchDesdeGP_PP(
+      "P17_7",
+      m17_1.code,
+      "PP",
+      m17_2.code,
+      "PP",
+      2,
+      phase17_24,
+      zone17_24
+    );
+    const m17_8 = crearMatchDesdeGP_PP(
+      "P17_8",
+      m17_3.code,
+      "PP",
+      m17_4.code,
+      "PP",
+      2,
+      phase17_24,
+      zone17_24
+    );
 
-  allMatches.push(
-    m17_1,
-    m17_2,
-    m17_3,
-    m17_4,
-    m17_5,
-    m17_6,
-    m17_7,
-    m17_8,
-    m17_9,
-    m17_10,
-    m17_11,
-    m17_12
-  );
+    // Ronda 3 (definición de 17–24)
+    const m17_9 = crearMatchDesdeGP_PP(
+      "P17_9",
+      m17_5.code,
+      "GP",
+      m17_6.code,
+      "GP",
+      3,
+      phase17_24,
+      zone17_24
+    );
+    const m17_10 = crearMatchDesdeGP_PP(
+      "P17_10",
+      m17_5.code,
+      "PP",
+      m17_6.code,
+      "PP",
+      3,
+      phase17_24,
+      zone17_24
+    );
+    const m17_11 = crearMatchDesdeGP_PP(
+      "P17_11",
+      m17_7.code,
+      "GP",
+      m17_8.code,
+      "GP",
+      3,
+      phase17_24,
+      zone17_24
+    );
+    const m17_12 = crearMatchDesdeGP_PP(
+      "P17_12",
+      m17_7.code,
+      "PP",
+      m17_8.code,
+      "PP",
+      3,
+      phase17_24,
+      zone17_24
+    );
 
+    allMatches.push(
+      m17_1,
+      m17_2,
+      m17_3,
+      m17_4,
+      m17_5,
+      m17_6,
+      m17_7,
+      m17_8,
+      m17_9,
+      m17_10,
+      m17_11,
+      m17_12
+    );
   } else if (totalEquipos === 22) {
-  // 6 terceros + 2 BYE (1°3° y 2°3° pasan directo)
-  // Patrón:
-  // 1°3° vs BYE
-  // 4°3° vs 5°3°
-  // 3°3° vs 6°3°
-  // 2°3° vs BYE
-
-  const m17_1 = crearMatchClasif(
-    "P17_1",
-    "1°3°",
-    "BYE (1°3°)",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  m17_1.isByeMatch = true; // BYE: no se programa
-
-  const m17_2 = crearMatchClasif(
-    "P17_2",
-    "4°3°",
-    "5°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
+    // 6 terceros + 2 BYE (1°3° y 2°3° pasan directo)
+    // Patrón:
+    // 1°3° vs BYE
+    // 4°3° vs 5°3°
+    // 3°3° vs 6°3°
+    // 2°3° vs BYE
+
+    const m17_1 = crearMatchClasif(
+      "P17_1",
+      "1°3°",
+      "BYE (1°3°)",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_1.isByeMatch = true; // BYE: no se programa
 
-  const m17_3 = crearMatchClasif(
-    "P17_3",
-    "3°3°",
-    "6°3°",
-    1,
-    phase17_24,
-    zone17_24
-  );
+    const m17_2 = crearMatchClasif(
+      "P17_2",
+      "4°3°",
+      "5°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
 
-  const m17_4 = crearMatchClasif(
-    "P17_4",
-    "2°3°",
-    "BYE (2°3°)",
-    1,
-    phase17_24,
-    zone17_24
-  );
-  m17_4.isByeMatch = true; // segundo BYE
+    const m17_3 = crearMatchClasif(
+      "P17_3",
+      "3°3°",
+      "6°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+
+    const m17_4 = crearMatchClasif(
+      "P17_4",
+      "2°3°",
+      "BYE (2°3°)",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_4.isByeMatch = true; // segundo BYE
 
     const m17_5 = crearMatchDesdeGP_PP(
       "P17_5",
       m17_1.code,
       "GP",
       m17_2.code,
       "GP",
       2,
       phase17_24,
       zone17_24
     );
     const m17_6 = crearMatchDesdeGP_PP(
       "P17_6",
       m17_3.code,
       "GP",
       m17_4.code,
       "GP",
       2,
       phase17_24,
       zone17_24
     );
     const m17_7 = crearMatchDesdeGP_PP(
       "P17_7",
       m17_1.code,
       "PP",
@@ -1819,54 +1983,135 @@ if (totalEquipos === 24) {
     const m17_12 = crearMatchDesdeGP_PP(
       "P17_12",
       m17_7.code,
       "PP",
       m17_8.code,
       "PP",
       3,
       phase17_24,
       zone17_24
     );
 
     allMatches.push(
       m17_1,
       m17_2,
       m17_3,
       m17_4,
       m17_5,
       m17_6,
       m17_7,
       m17_8,
       m17_9,
       m17_10,
       m17_11,
       m17_12
     );
-  }
+  } else if (totalEquipos === 21) {
+    // 5 terceros: 3°3°, 4°3° y 5°3° arrancan con BYE; 6°3° vs 7°3° define al cuarto semifinalista
+    const m17_1 = crearMatchClasif(
+      "P17_1",
+      "3°3°",
+      "BYE (3°3°)",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_1.isByeMatch = true;
 
-  return allMatches;
-}
+    const m17_2 = crearMatchClasif(
+      "P17_2",
+      "6°3°",
+      "7°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+
+    const m17_3 = crearMatchClasif(
+      "P17_3",
+      "4°3°",
+      "BYE (4°3°)",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_3.isByeMatch = true;
+
+    const m17_4 = crearMatchClasif(
+      "P17_4",
+      "BYE (5°3°)",
+      "5°3°",
+      1,
+      phase17_24,
+      zone17_24
+    );
+    m17_4.isByeMatch = true;
+
+    const m17_5 = crearMatchDesdeGP_PP(
+      "P17_5",
+      m17_1.code,
+      "GP",
+      m17_2.code,
+      "GP",
+      2,
+      phase17_24,
+      zone17_24
+    );
+    const m17_6 = crearMatchDesdeGP_PP(
+      "P17_6",
+      m17_3.code,
+      "GP",
+      m17_4.code,
+      "GP",
+      2,
+      phase17_24,
+      zone17_24
+    );
+
+    const m17_7 = crearMatchDesdeGP_PP(
+      "P17_7",
+      m17_5.code,
+      "PP",
+      m17_6.code,
+      "PP",
+      3,
+      phase17_24,
+      zone17_24
+    );
+    const m17_8 = crearMatchDesdeGP_PP(
+      "P17_8",
+      m17_5.code,
+      "GP",
+      m17_6.code,
+      "GP",
+      3,
+      phase17_24,
+      zone17_24
+    );
+
+    allMatches.push(m17_1, m17_2, m17_3, m17_4, m17_5, m17_6, m17_7, m17_8);
+  }
 
 
 // =====================
 //  SCHEDULER BÁSICO (ASIGNAR FECHAS / HORAS / CANCHAS)
 //  Versión slot-driven + días preferidos / mínimos
 // =====================
 function asignarHorarios(matches, options = {}) {
   if (!matches || !matches.length) return matches || [];
 
   // Duración y descanso (el descanso ahora es "suave")
   const dur = Number(options.matchDurationMinutes || 60);
   const restGlobal = Number(options.restMinMinutes || 0);
 
   // =====================
   //  CANCHAS
   // =====================
   let fields;
   if (Array.isArray(options.fields) && options.fields.length) {
     fields = options.fields.slice();
   } else if (
     appState.currentTournament &&
     Array.isArray(appState.currentTournament.fields) &&
     appState.currentTournament.fields.length
   ) {
     fields = appState.currentTournament.fields.slice();
@@ -2153,65 +2398,75 @@ function renumerarPartidosConIdsNumericos(matches) {
     }
   });
 
   return matches;
 }
 
 function reemplazarCodigoEnSeed(seedLabel, codeMap) {
   // Solo tocamos cosas tipo "GP P1", "PP P3", etc.
   const parts = seedLabel.split(" ");
   if (
     parts.length === 2 &&
     (parts[0] === "GP" || parts[0] === "PP")
   ) {
     const oldCode = parts[1];
     const newCode = codeMap[oldCode] || oldCode;
     return parts[0] + " " + newCode;
   }
   return seedLabel; // "1° A", "2° B", etc. se dejan igual
 }
 
 // =====================
 //  INICIALIZACIÓN GENERAL
 // =====================
 
 document.addEventListener("DOMContentLoaded", () => {
+  renderBuildStamp();
   loadTournamentsFromLocalStorage();
   startNewTournament();
   initNavigation();
   initStep1();
   initScheduleDaysUI(); // NUEVO: inicializa la tabla de días
   initTeamsSection();
   initFieldsSection();
   initBreaksSection();
   initFormatSection();
   initFixtureGeneration();
   initReportsAndExport();
   initTournamentsModal(); // NUEVO
 
 });
 
+function renderBuildStamp() {
+  const badge = document.getElementById("build-stamp");
+  if (!badge) return;
+
+  badge.textContent = APP_BUILD_STAMP;
+  badge.title =
+    "Versión en vivo. Si no ves esta fecha en la página publicada, recargá con Ctrl+F5.";
+}
+
 function startNewTournament() {
   appState.currentTournament = createEmptyTournament();
   syncUIFromState_step1();
   renderTeamsTable();
   renderFieldsTable();
   renderBreaksList();
   renderFixtureResult();
   renderExportView("zone");
 }
 
 // =====================
 //  NAVEGACIÓN PASOS
 // =====================
 
 function initNavigation() {
   const stepItems = document.querySelectorAll(".step-item");
   const stepPanels = document.querySelectorAll(".step-panel");
 
   function showStep(n) {
     stepItems.forEach((li) =>
       li.classList.toggle("active", li.dataset.step === String(n))
     );
     stepPanels.forEach((panel) =>
       panel.classList.toggle("active", panel.id === "step-" + n)
     );
@@ -2359,50 +2614,52 @@ function renderTeamsTable() {
       "<td>" +
       (team.longName || "") +
       "</td>" +
       "<td>" +
       (team.origin || "") +
       "</td>" +
       "<td>" +
       (team.category || "") +
       "</td>" +
       '<td><button class="btn ghost btn-sm" data-remove-team="' +
       team.id +
       '">✕</button></td>';
     tbody.appendChild(tr);
   });
 
   tbody.querySelectorAll("[data-remove-team]").forEach((btn) => {
     btn.addEventListener("click", () => {
       const id = btn.getAttribute("data-remove-team");
       const t = appState.currentTournament;
       if (!t) return;
       t.teams = t.teams.filter((tm) => tm.id !== id);
       upsertCurrentTournament();
       renderTeamsTable();
     });
   });
+
+  renderFormatInfo();
 }
 
 function clearTeamInputs() {
   ["team-short", "team-long", "team-origin", "team-category", "team-zone"].forEach(
     (id) => {
       const el = document.getElementById(id);
       if (el) el.value = "";
     }
   );
 }
 
 function importTeamsFromCsv(text) {
   const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
   if (lines.length <= 1) {
     alert("CSV vacío o sin encabezados.");
     return;
   }
 
   const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
   const zoneIdx = header.findIndex((h) => h.includes("zona"));
   const teamIdx = header.findIndex((h) => h.includes("equipo"));
 
   if (teamIdx === -1) {
     alert("No se encontró columna 'equipo' en el CSV (stub).");
     return;
@@ -2493,50 +2750,51 @@ function initFormatSection() {
       zonasBestPlaces.value =
         (fmt.zonas && fmt.zonas.bestPlacesMode) || "none";
     }
     if (elimType) {
       elimType.value =
         (fmt.eliminacion && fmt.eliminacion.type) || "simple";
     }
     if (avoidSameProvince) {
       avoidSameProvince.checked =
         fmt.restrictions && !!fmt.restrictions.avoidSameProvince;
     }
     if (avoidSameClub) {
       avoidSameClub.checked =
         fmt.restrictions && !!fmt.restrictions.avoidSameClub;
     }
     if (avoidFirstSlot) {
       avoidFirstSlot.checked =
         fmt.restrictions && !!fmt.restrictions.avoidFirstSlotStreak;
     }
     if (avoidLastSlot) {
       avoidLastSlot.checked =
         fmt.restrictions && !!fmt.restrictions.avoidLastSlotStreak;
     }
 
     refreshFormatPanels(fmt.type || "liga");
+    renderFormatInfo();
   }
 
   function updateFormat() {
     const t = appState.currentTournament;
     if (!t) return;
 
     if (!t.format) {
       t.format = {
         type: "liga",
         liga: { rounds: "ida" },
         zonas: { qualifiersPerZone: 2, bestPlacesMode: "none" },
         eliminacion: { type: "simple" },
         restrictions: {
           avoidSameProvince: false,
           avoidSameClub: false,
           avoidFirstSlotStreak: true,
           avoidLastSlotStreak: true,
         },
       };
     }
 
     if (formatSelect) {
       t.format.type = formatSelect.value;
     }
     if (ligaRounds) {
@@ -2546,71 +2804,138 @@ function initFormatSection() {
       t.format.zonas.qualifiersPerZone = Number(
         zonasQualifiers.value || 2
       );
     }
     if (zonasBestPlaces) {
       t.format.zonas.bestPlacesMode = zonasBestPlaces.value;
     }
     if (elimType) {
       t.format.eliminacion.type = elimType.value;
     }
     if (avoidSameProvince) {
       t.format.restrictions.avoidSameProvince = !!avoidSameProvince.checked;
     }
     if (avoidSameClub) {
       t.format.restrictions.avoidSameClub = !!avoidSameClub.checked;
     }
     if (avoidFirstSlot) {
       t.format.restrictions.avoidFirstSlotStreak = !!avoidFirstSlot.checked;
     }
     if (avoidLastSlot) {
       t.format.restrictions.avoidLastSlotStreak = !!avoidLastSlot.checked;
     }
 
     upsertCurrentTournament();
     refreshFormatPanels(t.format.type);
+    renderFormatInfo();
   }
 
   [
     formatSelect,
     ligaRounds,
     zonasQualifiers,
     zonasBestPlaces,
     elimType,
     avoidSameProvince,
     avoidSameClub,
     avoidFirstSlot,
     avoidLastSlot,
   ].forEach((el) => {
     if (!el) return;
     el.addEventListener("change", updateFormat);
   });
 
   // Al inicializar, reflejamos el estado actual del torneo
   syncFromState();
 }
 
+function renderFormatInfo() {
+  const infoBox = document.getElementById("format-info");
+  if (!infoBox) return;
+
+  const t = appState.currentTournament;
+  if (!t) {
+    infoBox.textContent = "Cargá al menos un torneo para ver el detalle del formato.";
+    return;
+  }
+
+  const fmtType = t.format && t.format.type;
+  if (fmtType !== "especial-8x3") {
+    infoBox.innerHTML =
+      "<strong>Detalle del formato</strong><br>" +
+      "Seleccioná \"Modelo especial Evita 21–24 equipos (7–8×3)\" para ver cómo se acomodan zonas y llaves.";
+    return;
+  }
+
+  const totalEquipos = Array.isArray(t.teams) ? t.teams.length : 0;
+  const zonasDetectadas = new Set();
+  (t.teams || []).forEach((team) => {
+    const z = (team.zone || "").trim();
+    if (z) zonasDetectadas.add(z);
+  });
+
+  const zonasEsperadas = totalEquipos === 21 ? 7 : 8;
+  const usaSieteZonas = totalEquipos === 21;
+
+  const mensajeZonas =
+    "Zonas detectadas: " +
+    zonasDetectadas.size +
+    " (se esperan " +
+    zonasEsperadas +
+    ").";
+
+  const mensajeLlaveB = usaSieteZonas
+    ? "Llave 9–16 (2°): 2°2° vs 2°3°, 5°2° vs 6°2°, 4°2° vs 7°2°, 1°3° vs 3°2°."
+    : "Llave 9–16 (2°): se mantiene el patrón original de 8×3 (sin subir segundos).";
+
+  const mensajeLlaveC = usaSieteZonas
+    ? "Llave 17–21 (3°): 3°3° y 4°3° arrancan con BYE; 5°3° espera en semifinal y el perdedor de 6°3° vs 7°3° queda 21°."
+    : "Llave 17–24 (3°): se asignan los BYE según la cantidad de equipos (manual Evita).";
+
+  const encabezado =
+    "<strong>Modelo Evita (" +
+    (totalEquipos || "?") +
+    " equipos)</strong><br>" +
+    (usaSieteZonas
+      ? "Con 21 equipos se usan 7 zonas de 3 (3 rondas) y el mejor 2° sube a la Zona A1."
+      : "Con 22 a 24 equipos se usa la estructura base de 8 zonas con los BYE oficiales.");
+
+  infoBox.innerHTML =
+    encabezado +
+    "<ul>" +
+    "<li>" +
+    mensajeZonas +
+    "</li>" +
+    "<li>" +
+    mensajeLlaveB +
+    "</li>" +
+    "<li>" +
+    mensajeLlaveC +
+    "</li>" +
+    "</ul>";
+}
+
 
 function renderFieldDaysMatrix() {
   const t = appState.currentTournament;
   if (!t) return;
   const container = document.getElementById("field-days-container");
   if (!container) return;
 
   const dayConfigs = Array.isArray(t.dayConfigs) ? t.dayConfigs : [];
   const fields = Array.isArray(t.fields) ? t.fields : [];
 
   if (!dayConfigs.length || !fields.length) {
     container.innerHTML =
       '<p class="text-muted">Definí las fechas del torneo y cargá al menos una cancha para configurar la disponibilidad por día.</p>';
     return;
   }
 
   // Asegurar estructura daysEnabled en cada cancha
   fields.forEach((field) => {
     if (!Array.isArray(field.daysEnabled)) {
       field.daysEnabled = [];
     }
     for (let i = 0; i < dayConfigs.length; i++) {
       if (typeof field.daysEnabled[i] !== "boolean") {
         field.daysEnabled[i] = true; // por defecto, disponible
       }
@@ -3013,91 +3338,74 @@ if (
     const zb = b.zone || "";
     if (za < zb) return -1;
     if (za > zb) return 1;
     const ra = a.round || 0;
     const rb = b.round || 0;
     return ra - rb;
   };
 
   try {
     const zonesSet = new Set();
     const roundsSet = new Set();
 
     fase1.forEach((m) => {
       if (m.zone) zonesSet.add(m.zone);
       if (typeof m.round === "number") roundsSet.add(m.round);
     });
 
     const zones = Array.from(zonesSet).sort((a, b) =>
       ("" + a).localeCompare("" + b, "es", {
         numeric: true,
         sensitivity: "base",
       })
     );
     const rounds = Array.from(roundsSet).sort((a, b) => a - b);
 
-    // Solo aplicamos el patrón si tenemos realmente 8 zonas y 3 rondas
-    if (zones.length === 8 && rounds.length >= 3) {
+    // Aplicamos el patrón estándar para 7 u 8 zonas con 3 rondas
+    if ((zones.length === 7 || zones.length === 8) && rounds.length >= 3) {
       const zoneRoundMap = {};
 
       fase1.forEach((m) => {
         const z = m.zone || "";
         const r = m.round || 1;
         if (!zoneRoundMap[z]) zoneRoundMap[z] = {};
         if (!zoneRoundMap[z][r]) zoneRoundMap[z][r] = [];
         zoneRoundMap[z][r].push(m);
       });
 
-      const [z1, z2, z3, z4, z5, z6, z7, z8] = zones;
+      const oddZones = zones.filter((_, idx) => idx % 2 === 0); // z1, z3, z5...
+      const evenZones = zones.filter((_, idx) => idx % 2 === 1); // z2, z4, z6...
 
       const patron = [
-        // Día 1
-        { r: 1, z: z1 },
-        { r: 1, z: z3 },
-        { r: 1, z: z5 },
-        { r: 1, z: z7 },
-        { r: 1, z: z2 },
-        { r: 1, z: z4 },
-        { r: 1, z: z6 },
-        { r: 1, z: z8 },
-        { r: 2, z: z1 },
-        { r: 2, z: z3 },
-        { r: 2, z: z5 },
-        { r: 2, z: z7 },
-        // Día 2
-        { r: 2, z: z2 },
-        { r: 2, z: z4 },
-        { r: 2, z: z6 },
-        { r: 2, z: z8 },
-        { r: 3, z: z1 },
-        { r: 3, z: z3 },
-        { r: 3, z: z5 },
-        { r: 3, z: z7 },
-        { r: 3, z: z2 },
-        { r: 3, z: z4 },
-        { r: 3, z: z6 },
-        { r: 3, z: z8 },
+        // Día 1 (R1 completo + R2 impares)
+        ...oddZones.map((z) => ({ r: 1, z })),
+        ...evenZones.map((z) => ({ r: 1, z })),
+        ...oddZones.map((z) => ({ r: 2, z })),
+        // Día 2 (R2 pares + R3 completo)
+        ...evenZones.map((z) => ({ r: 2, z })),
+        ...oddZones.map((z) => ({ r: 3, z })),
+        ...evenZones.map((z) => ({ r: 3, z })),
       ];
 
       const usados = new Set();
       const ordered = [];
 
       patron.forEach(({ r, z }) => {
         const lista =
           zoneRoundMap[z] && zoneRoundMap[z][r]
             ? zoneRoundMap[z][r]
             : null;
         if (lista && lista.length) {
           const m = lista.shift();
           ordered.push(m);
           if (m.id != null) usados.add(m.id);
         }
       });
 
       // Por seguridad, si quedara algún partido de Fase 1 sin ubicar, lo agregamos al final
       fase1.forEach((m) => {
         if (m.id == null || !usados.has(m.id)) {
           ordered.push(m);
         }
       });
 
       fase1Ordenada = ordered;
    } else {
      // Fallback: el viejo criterio zona+ronda
      fase1Ordenada.sort(ordenarZonaRonda);
    }
  } catch (e) {
    console.warn("No se pudo aplicar patrón especial Fase 1 (EVITA 8x3):", e);
    fase1Ordenada = fase1.slice().sort(ordenarZonaRonda);
  }

  // Elegimos índices reales para los días de zonas
  const idxDiaZonas1 =
    playableDayIndexes.length > 0 ? playableDayIndexes[0] : 0;
  const idxDiaZonas2 =
    playableDayIndexes.length > 1 ? playableDayIndexes[1] : idxDiaZonas1;

  // Mitad y mitad: primeros 12 partidos -> Día 1, siguientes 12 -> Día 2
  const mitad = Math.ceil(fase1Ordenada.length / 2);
  const fase1_dia1 = fase1Ordenada.slice(0, mitad);
  const fase1_dia2 = fase1Ordenada.slice(mitad);

  // Día preferido para el scheduler
  fase1_dia1.forEach((m) => (m.preferredDayIndex = idxDiaZonas1));
  fase1_dia2.forEach((m) => (m.preferredDayIndex = idxDiaZonas2));

  // Fases posteriores: mínimo tercer día jugable (si existe)
  if (playableDayIndexes.length > 2) {
    const idxMinOtros = playableDayIndexes[2];
    otros.forEach((m) => {
      m.minDayIndex = idxMinOtros;
    });
  }

  // Actualizamos base: primero Fase 1 (en orden especial), luego el resto
  matchesBase = [].concat(fase1_dia1, fase1_dia2, otros);
}

    

    // Asignar fechas / horas / canchas
    const matches = asignarHorarios(matchesBase, scheduleOptions);
    t.matches = matches;

    // Guardar última configuración de días para reabrir luego
    t.schedule = t.schedule || {};
    t.schedule.dayConfigs = (dayConfigsFromState || []).map((dc) =>
      Object.assign({}, dc)
    );

    upsertCurrentTournament();
    renderFixtureResult();
    renderExportView("zone");
  });
}


function renderFixtureResult() {
  const container = document.getElementById("fixture-result");
  if (!container) return;
  const t = appState.currentTournament;
  if (!t) return;
  container.innerHTML = "";

  if (!t.matches || !t.matches.length) {
    container.textContent = "Todavía no hay partidos generados.";
    return;
  }

  const teamById = {};
  t.teams.forEach((team) => {
    teamById[team.id] = team;
  });

  const fieldById = {};
  t.fields.forEach((f) => {
    fieldById[f.id] = f;
  });

  const table = document.createElement("table");
  table.className = "fixture-table";

  const thead = document.createElement("thead");
  thead.innerHTML =
    "<tr>" +
    "<th>#</th>" +
    "<th>Zona</th>" +
    "<th>Fecha</th>" +
    "<th>Hora</th>" +
    "<th>Cancha</th>" +
    "<th>Partido</th>" +
    "<th>Fase / Ronda</th>" +
    "</tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  let rowIndex = 0; // numeración global, sólo partidos reales

  t.matches.forEach((m) => {
    // No mostramos ni numeramos partidos BYE
    if (m.isByeMatch) return;

    const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
    const away = m.awayTeamId ? teamById[m.awayTeamId] : null;

    const homeLabel = home ? home.shortName : m.homeSeed || "?";
    const awayLabel = away ? away.shortName : m.awaySeed || "?";

    const field =
      m.fieldId && fieldById[m.fieldId]
        ? fieldById[m.fieldId].name
        : m.fieldId || "-";

    const phaseRoundLabel =
      (m.phase || "") +
      " (R" +
      (m.round || "-") +
      (m.code ? " · " + m.code : "") +
      ")";

    const tr = document.createElement("tr");
    rowIndex++; // sólo se incrementa en partidos no-BYE

    tr.innerHTML =
      "<td>" +
      rowIndex +
      "</td>" +
      "<td>" +
      (m.zone || "-") +
      "</td>" +
      "<td>" +
      (m.date || "-") +
      "</td>" +
      "<td>" +
      (m.time || "-") +
      "</td>" +
      "<td>" +
      field +
      "</td>" +
      "<td>" +
      homeLabel +
      " vs " +
      awayLabel +
      "</td>" +
      "<td>" +
      phaseRoundLabel +
      "</td>";

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}



// =====================
//  STEP 6: REPORTES / EXPORTAR
// =====================

function initReportsAndExport() {
  const btnZone = document.getElementById("btn-view-by-zone");
  const btnDay = document.getElementById("btn-view-by-day");
  const btnField = document.getElementById("btn-view-by-field");
  const btnTeam = document.getElementById("btn-view-by-team");
  const btnCsv = document.getElementById("btn-export-csv");
  const btnImg = document.getElementById("btn-export-image");
  const btnPdf = document.getElementById("btn-export-pdf");

  btnZone && btnZone.addEventListener("click", () => renderExportView("zone"));
  btnDay && btnDay.addEventListener("click", () => renderExportView("day"));
  btnField &&
    btnField.addEventListener("click", () => renderExportView("field"));
  btnTeam && btnTeam.addEventListener("click", () => renderExportView("team"));

  btnCsv && btnCsv.addEventListener("click", exportMatchesAsCsv);
  btnImg && btnImg.addEventListener("click", exportPreviewAsImage);
  btnPdf && btnPdf.addEventListener("click", exportPreviewAsPdf);

  renderExportView("zone");
}

function renderExportView(mode) {
  currentExportMode = mode;

  const container = document.getElementById("export-preview");
  if (!container) return;
  const t = appState.currentTournament;
  if (!t || !t.matches || !t.matches.length) {
    container.innerHTML = "Todavía no hay partidos generados.";
    return;
  }

  const teamById = {};
  t.teams.forEach((team) => {
    teamById[team.id] = team;
  });

  const fieldById = {};
  t.fields.forEach((f) => {
    fieldById[f.id] = f;
  });

  // Numeración global de partidos (sin BYE) para usar como ID consistente
  const matchNumberById = {};
  let globalIndex = 0;
  t.matches.forEach((m) => {
    if (m.isByeMatch) return;
    globalIndex++;
    matchNumberById[m.id] = globalIndex;
  });

  container.innerHTML = "";

  const grouped = {};

  if (mode === "zone") {
    t.matches.forEach((m) => {
      if (m.isByeMatch) return;
      const key = m.zone || "Sin zona";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "day") {
    t.matches.forEach((m) => {
      if (m.isByeMatch) return;
      const key = m.date || "Sin fecha";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "field") {
    t.matches.forEach((m) => {
      if (m.isByeMatch) return;
      const key = m.fieldId || "Sin cancha";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "team") {
    t.matches.forEach((m) => {
      if (m.isByeMatch) return;
      if (m.homeTeamId) {
        if (!grouped[m.homeTeamId]) grouped[m.homeTeamId] = [];
        grouped[m.homeTeamId].push(Object.assign({ role: "Local" }, m));
      }
      if (m.awayTeamId) {
        if (!grouped[m.awayTeamId]) grouped[m.awayTeamId] = [];
        grouped[m.awayTeamId].push(Object.assign({ role: "Visitante" }, m));
      }
    });
  }

  const modeTitle =
    {
      zone: "Vista por zona",
      day: "Vista por día",
      field: "Vista por cancha",
      team: "Vista por equipo",
    }[mode] || "";

  const title = document.createElement("h3");
  title.textContent = modeTitle;
  container.appendChild(title);

  const keys = Object.keys(grouped).sort();

  keys.forEach((key) => {
    const block = document.createElement("div");
    block.style.marginBottom = "1rem";

    let headingText = "";
    if (mode === "zone") {
      headingText = "Zona " + key;
    } else if (mode === "day") {
      headingText = "Día " + key;
    } else if (mode === "field") {
      const field = fieldById[key];
      headingText = "Cancha: " + (field ? field.name : key);
    } else if (mode === "team") {
      const team = teamById[key];
      headingText = "Equipo: " + (team ? team.shortName : key);
    }

    const h4 = document.createElement("h4");
    h4.textContent = headingText;
    block.appendChild(h4);

    const table = document.createElement("table");
    table.className = "fixture-table";
    const thead = document.createElement("thead");

    if (mode === "team") {
      thead.innerHTML =
        "<tr>" +
        "<th>Fecha</th>" +
        "<th>Hora</th>" +
        "<th>Cancha</th>" +
        "<th>Rival</th>" +
        "<th>Rol</th>" +
        "<th>Zona</th>" +
        "<th>Fase / Ronda</th>" +
        "<th>ID</th>" +
        "</tr>";
    } else {
      thead.innerHTML =
        "<tr>" +
        "<th>Fecha</th>" +
        "<th>Hora</th>" +
        "<th>Cancha</th>" +
        "<th>Partido</th>" +
        "<th>Zona</th>" +
        "<th>Fase / Ronda</th>" +
        "<th>ID</th>" +
        "</tr>";
    }
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Orden dentro de cada grupo
    let rows = grouped[key].slice();
    if (mode === "day") {
      rows.sort((a, b) => {
        const ta = a.time || "";
        const tb = b.time || "";
        if (ta < tb) return -1;
        if (ta > tb) return 1;

        // Desempate por cancha
        const fa = a.fieldId || "";
        const fb = b.fieldId || "";
        if (fa < fb) return -1;
        if (fa > fb) return 1;

        // Desempate final por número de partido global
        const ida = matchNumberById[a.id] || 0;
        const idb = matchNumberById[b.id] || 0;
        return ida - idb;
      });
    }

    rows.forEach((m) => {
      const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
      const away = m.awayTeamId ? teamById[m.awayTeamId] : null;
      const homeLabel = home ? home.shortName : m.homeSeed || "?";
      const awayLabel = away ? away.shortName : m.awaySeed || "?";
      const field =
        m.fieldId && fieldById[m.fieldId]
          ? fieldById[m.fieldId].name
          : m.fieldId || "-";

      const phaseRoundLabel =
        (m.phase || "") +
        " (R" +
        (m.round || "-") +
        (m.code ? " · " + m.code : "") +
        ")";

      const tr = document.createElement("tr");
      const matchNumber =
        matchNumberById[m.id] != null ? matchNumberById[m.id] : "";

      if (mode === "team") {
        const isHome = m.role === "Local";
        const rivalLabel = isHome ? awayLabel : homeLabel;

        tr.innerHTML =
          "<td>" +
          (m.date || "-") +
          "</td>" +
          "<td>" +
          (m.time || "-") +
          "</td>" +
          "<td>" +
          field +
          "</td>" +
          "<td>" +
          rivalLabel +
          "</td>" +
          "<td>" +
          (m.role || "") +
          "</td>" +
          "<td>" +
          (m.zone || "-") +
          "</td>" +
          "<td>" +
          phaseRoundLabel +
          "</td>" +
          "<td>" +
          matchNumber +
          "</td>";
      } else {
        tr.innerHTML =
          "<td>" +
          (m.date || "-") +
          "</td>" +
          "<td>" +
          (m.time || "-") +
          "</td>" +
          "<td>" +
          field +
          "</td>" +
          "<td>" +
          homeLabel +
          " vs " +
          awayLabel +
          "</td>" +
          "<td>" +
          (m.zone || "-") +
          "</td>" +
          "<td>" +
          phaseRoundLabel +
          "</td>" +
          "<td>" +
          matchNumber +
          "</td>";
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);
    container.appendChild(block);
  });
}


function exportMatchesAsCsv() {
  const t = appState.currentTournament;
  if (!t || !t.matches || !t.matches.length) {
    alert("No hay partidos para exportar.");
    return;
  }

  const teamById = {};
  t.teams.forEach((team) => {
    teamById[team.id] = team;
  });

  const fieldById = {};
  t.fields.forEach((f) => {
    fieldById[f.id] = f;
  });

  const rows = [];
  rows.push(
    [
      "Nro",
      "Zona",
      "Fecha",
      "Hora",
      "Cancha",
      "Local",
      "Visitante",
      "Fase",
      "Ronda",
      "IdPartido",
    ].join(";")
  );

let rowIndex = 0;

t.matches.forEach((m) => {
  if (m.isByeMatch) return; // <<--- NO exportar BYE

  const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
  const away = m.awayTeamId ? teamById[m.awayTeamId] : null;

  const homeLabel = home ? home.shortName : m.homeSeed || "";
  const awayLabel = away ? away.shortName : m.awaySeed || "";

  const field =
    m.fieldId && fieldById[m.fieldId]
      ? fieldById[m.fieldId].name
      : m.fieldId || "";

  rowIndex++;

  rows.push(
    [
      String(rowIndex),
      m.zone || "",
      m.date || "",
      m.time || "",
      field,
      homeLabel,
      awayLabel,
      m.phase || "",
      String(m.round || ""),
      m.code || "",
    ].join(";")
  );
});


  const csvContent = rows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = (t.name || "fixture").replace(/[^\w\-]+/g, "_");
  a.download = baseName + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPreviewAsImage() {
  const container = document.getElementById("export-preview");
  const t = appState.currentTournament;
  if (!container || !t) {
    alert("No hay vista para exportar.");
    return;
  }
  if (typeof html2canvas === "undefined") {
    alert(
      "La función de exportar imagen todavía no está disponible (html2canvas no cargó)."
    );
    return;
  }

  html2canvas(container, {
    scale: 1.5,
    backgroundColor: "#020617",
  }).then((canvas) => {
    const imgData = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    const baseName = (t.name || "fixture").replace(/[^\w\-]+/g, "_");
    link.href = imgData;
    link.download = baseName + ".png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// PDF con texto usando jsPDF + autoTable
function exportPreviewAsPdf() {
  const t = appState.currentTournament;
  if (!t || !t.matches || !t.matches.length) {
    alert("No hay partidos para exportar.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF no está disponible. Verificá la carga del script.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");

  if (typeof doc.autoTable !== "function") {
    alert(
      "La función autoTable de jsPDF no está disponible. Verificá que el script 'jspdf-autotable' se haya cargado."
    );
    return;
  }

  const mode = currentExportMode || "zone";

  const teamById = {};
  t.teams.forEach((team) => {
    teamById[team.id] = team;
  });

  const fieldById = {};
  t.fields.forEach((f) => {
    fieldById[f.id] = f;
  });

  const grouped = {};

  if (mode === "zone") {
    t.matches.forEach((m) => {
      const key = m.zone || "Sin zona";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "day") {
    t.matches.forEach((m) => {
      const key = m.date || "Sin fecha";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "field") {
    t.matches.forEach((m) => {
      const key = m.fieldId || "Sin cancha";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    });
  } else if (mode === "team") {
    t.matches.forEach((m) => {
      if (m.homeTeamId) {
        if (!grouped[m.homeTeamId]) grouped[m.homeTeamId] = [];
        grouped[m.homeTeamId].push(Object.assign({ role: "Local" }, m));
      }
      if (m.awayTeamId) {
        if (!grouped[m.awayTeamId]) grouped[m.awayTeamId] = [];
        grouped[m.awayTeamId].push(Object.assign({ role: "Visitante" }, m));
      }
    });
  }

  const keys = Object.keys(grouped).sort();
  let firstGroup = true;

  keys.forEach((key) => {
    if (!firstGroup) {
      doc.addPage();
    }
    firstGroup = false;

    let headingText = "";
    if (mode === "zone") {
      headingText = "Zona " + key;
    } else if (mode === "day") {
      headingText = "Día " + key;
    } else if (mode === "field") {
      const field = fieldById[key];
      headingText = "Cancha: " + (field ? field.name : key);
    } else if (mode === "team") {
      const team = teamById[key];
      headingText = "Equipo: " + (team ? team.shortName : key);
    }

    doc.setFontSize(12);
    doc.text(headingText, 14, 15);

    let head = [];
    const body = [];

    if (mode === "team") {
      head = [
        [
          "Fecha",
          "Hora",
          "Cancha",
          "Rival",
          "Rol",
          "Zona",
          "Fase / Ronda",
          "ID",
        ],
      ];

      grouped[key].forEach((m) => {
        const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
        const away = m.awayTeamId ? teamById[m.awayTeamId] : null;
        const homeLabel = home ? home.shortName : m.homeSeed || "?";
        const awayLabel = away ? away.shortName : m.awaySeed || "?";
        const field =
          m.fieldId && fieldById[m.fieldId]
            ? fieldById[m.fieldId].name
            : m.fieldId || "";
        const isHome = m.role === "Local";
        const rivalLabel = isHome ? awayLabel : homeLabel;
        const phaseRoundLabel =
          (m.phase || "") +
          " (R" +
          (m.round || "-") +
          (m.code ? " · " + m.code : "") +
          ")";

        body.push([
          m.date || "",
          m.time || "",
          field,
          rivalLabel,
          m.role || "",
          m.zone || "",
          phaseRoundLabel,
          m.code || "",
        ]);
      });
    } else {
      head = [
        [
          "Fecha",
          "Hora",
          "Cancha",
          "Local",
          "Visitante",
          "Zona",
          "Fase / Ronda",
          "ID",
        ],
      ];

      grouped[key].forEach((m) => {
        const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
        const away = m.awayTeamId ? teamById[m.awayTeamId] : null;
        const homeLabel = home ? home.shortName : m.homeSeed || "";
        const awayLabel = away ? away.shortName : m.awaySeed || "";
        const field =
          m.fieldId && fieldById[m.fieldId]
            ? fieldById[m.fieldId].name
            : m.fieldId || "";
        const phaseRoundLabel =
          (m.phase || "") +
          " (R" +
          (m.round || "-") +
          (m.code ? " · " + m.code : "") +
          ")";

        body.push([
          m.date || "",
          m.time || "",
          field,
          homeLabel,
          awayLabel,
          m.zone || "",
          phaseRoundLabel,
          m.code || "",
        ]);
      });
    }

    doc.autoTable({
      startY: 22,
      head: head,
      body: body,
      styles: {
        fontSize: 8,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
      },
      margin: { left: 10, right: 10 },
    });
  });

  const baseName = (t.name || "fixture").replace(/[^\w\-]+/g, "_");
  doc.save(baseName + ".pdf");
}
// =====================
//  MODAL: GESTIÓN DE TORNEOS
// =====================

function initTournamentsModal() {
  const btnClose = document.getElementById("btn-close-tournaments");
  const modal = document.getElementById("tournaments-modal");
  const backdrop = modal ? modal.querySelector(".modal-backdrop") : null;

  btnClose &&
    btnClose.addEventListener("click", () => {
      closeTournamentsModal();
    });

  backdrop &&
    backdrop.addEventListener("click", () => {
      closeTournamentsModal();
    });
}

function openTournamentsModal() {
  const modal = document.getElementById("tournaments-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderTournamentsTable();
}

function closeTournamentsModal() {
  const modal = document.getElementById("tournaments-modal");
  if (!modal) return;
  modal.classList.add("hidden");
}

function renderTournamentsTable() {
  const tbody = document.querySelector("#tournaments-table tbody");
  const empty = document.getElementById("tournaments-empty");
  if (!tbody || !empty) return;

  tbody.innerHTML = "";
  const list = appState.tournaments || [];

  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.forEach((tourn) => {
    const tr = document.createElement("tr");
    const dates =
      (tourn.dateStart || "") +
      (tourn.dateEnd ? " al " + tourn.dateEnd : "");
    tr.innerHTML =
      "<td>" +
      (tourn.name || "(sin nombre)") +
      "</td>" +
      "<td>" +
      (tourn.category || "") +
      "</td>" +
      "<td>" +
      dates +
      "</td>" +
      "<td>" +
      tourn.id +
      "</td>" +
      '<td class="actions">' +
      '<button class="btn primary btn-sm" data-open="' +
      tourn.id +
      '">Abrir</button> ' +
      '<button class="btn ghost btn-sm" data-duplicate="' +
      tourn.id +
      '">Duplicar</button> ' +
      '<button class="btn ghost btn-sm" data-delete="' +
      tourn.id +
      '">Borrar</button>' +
      "</td>";
    tbody.appendChild(tr);
  });

    // Abrir torneo
  tbody.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      const t = appState.tournaments.find((x) => x.id === id);
      if (!t) return;
      appState.currentTournament = t;
      syncUIFromState_step1();
      renderTeamsTable();
      renderFieldsTable();
      renderBreaksList();
      renderDayConfigs();        // NUEVO
      renderFieldDaysMatrix();   // NUEVO
      renderFixtureResult();
      renderExportView("zone");
      closeTournamentsModal();
    });
  });


  // Duplicar torneo
  tbody.querySelectorAll("[data-duplicate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-duplicate");
      const original = appState.tournaments.find((x) => x.id === id);
      if (!original) return;

      const copy = JSON.parse(JSON.stringify(original));
      copy.id = safeId("t");
      copy.name = (original.name || "(sin nombre)") + " (copia)";
      appState.tournaments.push(copy);
      saveTournamentsToLocalStorage();
      renderTournamentsTable();
    });
  });

  // Borrar torneo
  tbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-delete");
      const original = appState.tournaments.find((x) => x.id === id);
      if (!original) return;
      const ok = confirm(
        "¿Seguro que querés borrar el torneo:\n\n" +
          (original.name || "(sin nombre)") +
          " ?"
      );
      if (!ok) return;

      appState.tournaments = appState.tournaments.filter(
        (tourn) => tourn.id !== id
      );
      saveTournamentsToLocalStorage();

      // Si borramos el que estaba abierto, arrancamos uno nuevo
      if (appState.currentTournament && appState.currentTournament.id === id) {
        startNewTournament();
      }
      renderTournamentsTable();
    });
  });
}
