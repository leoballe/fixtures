// app.js v0.5
// - Generación de fixture (liga / zonas / eliminación)
// - Scheduler básico
// - Vistas por zona / día / cancha / equipo
// - Exportar CSV, PNG, PDF (texto con jsPDF + autoTable)
// - Playoffs automáticos desde zonas con IDs de partido (P1, P2...) y refs GP / PP

// =====================
//  ESTADO GLOBAL
// =====================
// =====================
// MODELOS EVITA (24 equipos)
// =====================

const EVITA_MODELS = {
  EVITA_24_8x3_NORMAL_5D_2C: {
    id: "EVITA_24_8x3_NORMAL_5D_2C",
    nombre: "24 equipos · 8×3 · 5 días · 2 canchas (normal)",
    descripcion:
      "Modelo Evita con 8 zonas de 3 equipos, fase de zonas, grupos A1/A2 y definición de puestos 1 al 24.",

    // Metadatos básicos del modelo
    meta: {
      equiposEsperados: 24,
      estructuraZonas: "8x3",        // 8 zonas de 3
      diasRecomendados: 5,
      canchasRecomendadas: 2,
      // En el futuro podemos usar esto para advertir si faltan/e sobran equipos, días, etc.
    },

    // Fases deportivas declaradas (todavía no se usan al 100%, pero nos sirven como "mapa")
    fases: [
      {
        id: "F1_ZONAS",
        tipo: "zonas-roundrobin",
        etiqueta: "Fase 1 · Zonas 8×3",
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
      bloques: [
        {
          id: "BLOQUE_ZONAS",
          fases: ["F1_ZONAS"],
          rangoDiasSugerido: { desde: 1, hasta: 3 }, // toda la fase regular entre día 1 y 3
        },
        {
          id: "BLOQUE_INTERMEDIO",
          fases: ["F2_A1A2", "F3_9_16", "F4_17_24"],
          rangoDiasSugerido: { desde: 3, hasta: 4 },
        },
        {
          id: "BLOQUE_FINALES",
          fases: ["F5_1_8", "F3_9_16", "F4_17_24"],
          rangoDiasSugerido: { desde: 4, hasta: 5 }, // finales de todo al cierre
        },
      ],
    },
  },
};
// Generador base para modelos Evita
// Por ahora, para el modelo 24 equipos 8×3 usamos la lógica que ya tenés
function generarPartidosDesdeModeloEvita(torneo, modeloId) {
  const modelo = EVITA_MODELS[modeloId];
  if (!modelo) {
    console.warn("Modelo Evita no encontrado:", modeloId);
    return [];
  }

  // En esta primera etapa, el único modelo soportado es 24 equipos · 8×3
  if (modeloId === "EVITA_24_8x3_NORMAL_5D_2C") {
    // IMPORTANTE:
    // - generarEspecial8x3(torneo) ya arma: zonas, A1/A2, 9–16, 17–24, 1–8
    // - ordenarMatchesEspecial8x3(...) los ordena "al estilo Evita" (zonas primero, finales al final)
    const base = generarEspecial8x3(torneo);
    if (!base || !base.length) return [];
    return ordenarMatchesEspecial8x3(base);
  }

  // Para otros modelos que agreguemos más adelante:
  console.warn(
    "El modelo Evita está definido pero aún no tiene generador específico:",
    modeloId
  );
  return [];
}
// =====================
// DÍAS DEL TORNEO (Día 1, Día 2, …)
// =====================

// Construye/actualiza t.dayConfigs según fecha inicio/fin
function ensureDayConfigs(t) {
  if (!t) return;

  const startStr = t.dateStart;
  const endStr = t.dateEnd;
  const startDate = startStr ? dateStrToDate(startStr) : null;
  const endDate = endStr ? dateStrToDate(endStr) : null;

  if (!startDate || !endDate || endDate < startDate) {
    t.dayConfigs = [];
    return;
  }

  const previous = Array.isArray(t.dayConfigs) ? t.dayConfigs : [];
  const result = [];

  let dayIndex = 0;
  for (
    let d = new Date(startDate.getTime());
    d <= endDate;
    d = addDays(d, 1), dayIndex++
  ) {
    const dateStr = formatDate(d);
    const existing = previous.find((dc) => dc.date === dateStr);

    const baseType = existing && existing.type ? existing.type : "full";
    const baseMin =
      (existing && existing.timeMin) || t.dayTimeMin || "09:00";
    const baseMax =
      (existing && existing.timeMax) || t.dayTimeMax || "22:00";

    result.push({
      index: dayIndex + 1, // Día 1, Día 2...
      date: dateStr,
      type: baseType, // "full" | "half" | "off"
      timeMin: baseMin,
      timeMax: baseMax,
    });
  }

  t.dayConfigs = result;
}

// Dibuja la tabla "Días del torneo" en el Paso 4
function renderDayConfigs() {
  const t = appState.currentTournament;
  const tbody = document.getElementById("schedule-days-body");
  if (!t || !tbody) return;

  ensureDayConfigs(t);

  const dayConfigs = t.dayConfigs || [];
  tbody.innerHTML = "";

  if (!dayConfigs.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="5" class="text-muted">Definí primero la fecha de inicio y fin del torneo en el Paso 1.</td>';
    tbody.appendChild(tr);
    return;
  }

  dayConfigs.forEach((dc, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>Día " +
      (dc.index || idx + 1) +
      "</td>" +
      "<td>" +
      (dc.date || "") +
      "</td>" +
      '<td><select class="day-type" data-day-index="' +
      idx +
      '">' +
      '<option value="full">Completo</option>' +
      '<option value="half">Medio día</option>' +
      '<option value="off">No se juega</option>' +
      "</select></td>" +
      '<td><input type="time" class="day-time-min" data-day-index="' +
      idx +
      '" value="' +
      (dc.timeMin || "") +
      '"></td>' +
      '<td><input type="time" class="day-time-max" data-day-index="' +
      idx +
      '" value="' +
      (dc.timeMax || "") +
      '"></td>';

    tbody.appendChild(tr);
  });

  // Ajustar el select al valor actual
  dayConfigs.forEach((dc, idx) => {
    const sel = tbody.querySelector(
      'select.day-type[data-day-index="' + idx + '"]'
    );
    if (sel) {
      sel.value = dc.type || "full";
    }
  });

  const tCurrent = appState.currentTournament;

  // Listeners: tipo de día
  tbody.querySelectorAll("select.day-type").forEach((sel) => {
    sel.addEventListener("change", () => {
      const idx = parseInt(sel.getAttribute("data-day-index"), 10);
      if (!tCurrent.dayConfigs || !tCurrent.dayConfigs[idx]) return;
      tCurrent.dayConfigs[idx].type = sel.value;
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  });

  // Listeners: hora inicio
  tbody.querySelectorAll("input.day-time-min").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.getAttribute("data-day-index"), 10);
      if (!tCurrent.dayConfigs || !tCurrent.dayConfigs[idx]) return;
      tCurrent.dayConfigs[idx].timeMin = inp.value;
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  });

  // Listeners: hora fin
  tbody.querySelectorAll("input.day-time-max").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = parseInt(inp.getAttribute("data-day-index"), 10);
      if (!tCurrent.dayConfigs || !tCurrent.dayConfigs[idx]) return;
      tCurrent.dayConfigs[idx].timeMax = inp.value;
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  });
}



const appState = {
  currentTournament: null,
  tournaments: [],
};

// modo actual de vista en la pestaña de reportes
let currentExportMode = "zone";

// =====================
//  UTILIDADES GENERALES
// =====================

function safeId(prefix) {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return prefix + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function createEmptyTournament() {
  return {
    id: safeId("t"),
    name: "",
    category: "",
    dateStart: "",
    dateEnd: "",
    storageMode: "local",
    format: {
      type: "liga", // liga | zonas | zonas-playoffs | eliminacion
      liga: { rounds: "ida" }, // ida | ida-vuelta
      zonas: { qualifiersPerZone: 2, bestPlacesMode: "none" },
      eliminacion: { type: "simple" }, // simple | third-place | consolation
      restrictions: {
        avoidSameProvince: false,
        avoidSameClub: false,
        avoidFirstSlotStreak: true,
        avoidLastSlotStreak: true,
      },
    },
    teams: [],
    fields: [],
    breaks: [],
    dayTimeMin: "09:00",
    dayTimeMax: "22:00",
    matchDurationMinutes: 60,
    restMinMinutes: 90,
    matches: [],
  };
}

// =====================
//  STORAGE LOCAL
// =====================

const LS_KEY = "fixture-planner-tournaments";

function loadTournamentsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) appState.tournaments = parsed;
  } catch (e) {
    console.error("Error leyendo LocalStorage", e);
  }
}

function saveTournamentsToLocalStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(appState.tournaments));
  } catch (e) {
    console.error("Error guardando LocalStorage", e);
  }
}

function upsertCurrentTournament() {
  if (!appState.currentTournament) return;
  const id = appState.currentTournament.id;
  const idx = appState.tournaments.findIndex((t) => t.id === id);
  if (idx === -1) appState.tournaments.push(appState.currentTournament);
  else appState.tournaments[idx] = appState.currentTournament;
  saveTournamentsToLocalStorage();
}

// =====================
//  UTILIDADES FECHA/HORA
// =====================

function parseTimeToMinutes(t) {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTimeStr(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function dateStrToDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

// =====================
//  ENGINE: LIGA / ZONAS
// =====================

function generarFixtureLiga(teamIds, options) {
  options = options || {};
  const idaVuelta = !!options.idaVuelta;
  const zone = options.zone || null;
  const phase = options.phase || "fase-liga";

  const equipos = teamIds.slice();
  if (equipos.length < 2) return [];

  if (equipos.length % 2 === 1) {
    equipos.push(null);
  }

  const n = equipos.length;
  const rondas = n - 1;
  const fixtures = [];
  let arr = equipos.slice();

  for (let r = 0; r < rondas; r++) {
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home && away) {
        fixtures.push({
          id: safeId("m"),
          code: null, // lo usamos para playoffs; en liga puede ir vacío
          zone: zone,
          homeTeamId: home,
          awayTeamId: away,
          homeSeed: null,
          awaySeed: null,
          fromHomeMatchCode: null,
          fromHomeResult: null,
          fromAwayMatchCode: null,
          fromAwayResult: null,
          date: null,
          time: null,
          fieldId: null,
          round: r + 1,
          phase: phase,
        });
      }
    }
    const fixed = arr[0];
    const rotating = arr.slice(1);
    rotating.unshift(rotating.pop());
    arr = [fixed].concat(rotating);
  }

  if (idaVuelta) {
    const vuelta = fixtures.map((m) => ({
      id: safeId("m"),
      code: null,
      zone: m.zone,
      homeTeamId: m.awayTeamId,
      awayTeamId: m.homeTeamId,
      homeSeed: null,
      awaySeed: null,
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

function generarFixtureZonas(zonesMap, options) {
  options = options || {};
  const idaVuelta = !!options.idaVuelta;
  const all = [];
  for (const zoneName in zonesMap) {
    const ids = zonesMap[zoneName];
    if (!Array.isArray(ids) || !ids.length) continue;
    const part = generarFixtureLiga(ids, {
      idaVuelta: idaVuelta,
      zone: zoneName,
      phase: "fase-zonas",
    });
    all.push.apply(all, part);
  }
  return all;
}

// =====================
//  ENGINE: ELIMINACIÓN DIRECTA
// =====================
// Genera árbol completo de playoffs a partir de una lista de equipos.
// Usa códigos P1, P2... y referencias GP/PP internamente como seeds de texto.

function generarLlavesEliminacion(teamIds, options) {
  options = options || {};
  const elimType = options.type || "simple"; // simple | third-place | consolation
  const ids = teamIds.slice().filter(Boolean);
  if (ids.length < 2) return [];

  // si no es potencia de 2, por ahora no rellenamos con BYE: tomamos pares hasta agotar
  const seeds = ids.map((id) => ({
    label: null,
    teamId: id,
  }));

  let matchCodeCounter = 0;
  const rounds = [];

  // Primera ronda con equipos reales
  const round1 = [];
  for (let i = 0; i < seeds.length; i += 2) {
    const s1 = seeds[i];
    const s2 = seeds[i + 1];
    if (!s2) break;
    const code = "P" + ++matchCodeCounter;
    round1.push({
      id: safeId("m"),
      code,
      zone: null,
      homeTeamId: s1.teamId,
      awayTeamId: s2.teamId,
      homeSeed: null,
      awaySeed: null,
      fromHomeMatchCode: null,
      fromHomeResult: null,
      fromAwayMatchCode: null,
      fromAwayResult: null,
      date: null,
      time: null,
      fieldId: null,
      round: 1,
      phase: "playoff-main",
    });
  }
  rounds.push(round1);

  // Rondas siguientes (ganadores GP)
  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    const current = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1];
      if (!m2) break;
      const code = "P" + ++matchCodeCounter;
      current.push({
        id: safeId("m"),
        code,
        zone: null,
        homeTeamId: null,
        awayTeamId: null,
        homeSeed: "GP " + m1.code,
        awaySeed: "GP " + m2.code,
        fromHomeMatchCode: m1.code,
        fromHomeResult: "GP",
        fromAwayMatchCode: m2.code,
        fromAwayResult: "GP",
        date: null,
        time: null,
        fieldId: null,
        round: rounds.length + 1,
        phase: "playoff-main",
      });
    }
    rounds.push(current);
  }

  const all = rounds.flat();

  // Tercer puesto (PP de las semis)
  if (elimType === "third-place" || elimType === "consolation") {
    if (rounds.length >= 2) {
      const semis = rounds[rounds.length - 2];
      if (semis.length >= 2) {
        const s1 = semis[0];
        const s2 = semis[1];
        const code = "P" + ++matchCodeCounter;
        all.push({
          id: safeId("m"),
          code,
          zone: null,
          homeTeamId: null,
          awayTeamId: null,
          homeSeed: "PP " + s1.code,
          awaySeed: "PP " + s2.code,
          fromHomeMatchCode: s1.code,
          fromHomeResult: "PP",
          fromAwayMatchCode: s2.code,
          fromAwayResult: "PP",
          date: null,
          time: null,
          fieldId: null,
          round: rounds.length + 1,
          phase: "playoff-third",
        });
      }
    }
  }

  return all;
}

// =====================
//  ENGINE: PLAYOFFS DESDE ZONAS (PLACEHOLDERS 1°/2° + ÁRBOL COMPLETO)
// =====================

function generarPlayoffsDesdeZonas(t, elimType) {
  const zonesSet = new Set();
  t.teams.forEach((team) => {
    const z = (team.zone || "").trim();
    if (z) zonesSet.add(z);
  });
  const zones = Array.from(zonesSet).sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })
  );

  const qualifiers =
    (t.format &&
      t.format.zonas &&
      Number(t.format.zonas.qualifiersPerZone || 0)) ||
    0;
  const bestMode =
    (t.format && t.format.zonas && t.format.zonas.bestPlacesMode) || "none";

  if (!zones.length || qualifiers < 1) return [];

  if (bestMode !== "none") {
    console.warn(
      "Mejores segundos/terceros todavía no están implementados: se generan solo cruces con clasificados directos."
    );
  }

  // Construimos seeds de la primera ronda (texto tipo '1° A', '2° B', etc.)
  let firstSeeds = [];

  if (
    qualifiers === 2 &&
    bestMode === "none" &&
    zones.length >= 2 &&
    zones.length % 2 === 0
  ) {
    // Esquema clásico: A vs B, C vs D, etc.
    for (let i = 0; i < zones.length; i += 2) {
      const zA = zones[i];
      const zB = zones[i + 1];
      firstSeeds.push(
        { label: "1° " + zA },
        { label: "2° " + zB },
        { label: "1° " + zB },
        { label: "2° " + zA }
      );
    }
  } else {
    // Fallback genérico: todos los 1°, luego todos los 2°, etc.
    for (let pos = 1; pos <= qualifiers; pos++) {
      zones.forEach((zoneName) => {
        firstSeeds.push({
          label: pos + "° " + zoneName,
        });
      });
    }
  }

  // Construimos árbol completo igual que en eliminación directa,
  // pero acá TODOS los seeds iniciales son placeholders de zona.
  let matchCodeCounter = 0;
  const rounds = [];

  const round1 = [];
  for (let i = 0; i < firstSeeds.length; i += 2) {
    const s1 = firstSeeds[i];
    const s2 = firstSeeds[i + 1];
    if (!s2) break;
    const code = "P" + ++matchCodeCounter;
    round1.push({
      id: safeId("m"),
      code,
      zone: null,
      homeTeamId: null,
      awayTeamId: null,
      homeSeed: s1.label,
      awaySeed: s2.label,
      fromHomeMatchCode: null,
      fromHomeResult: null,
      fromAwayMatchCode: null,
      fromAwayResult: null,
      date: null,
      time: null,
      fieldId: null,
      round: 1,
      phase: "playoff-main",
    });
  }
  rounds.push(round1);

  // Siguientes rondas (ganadores GP)
  while (rounds[rounds.length - 1].length > 1) {
    const prev = rounds[rounds.length - 1];
    const current = [];
    for (let i = 0; i < prev.length; i += 2) {
      const m1 = prev[i];
      const m2 = prev[i + 1];
      if (!m2) break;
      const code = "P" + ++matchCodeCounter;
      current.push({
        id: safeId("m"),
        code,
        zone: null,
        homeTeamId: null,
        awayTeamId: null,
        homeSeed: "GP " + m1.code,
        awaySeed: "GP " + m2.code,
        fromHomeMatchCode: m1.code,
        fromHomeResult: "GP",
        fromAwayMatchCode: m2.code,
        fromAwayResult: "GP",
        date: null,
        time: null,
        fieldId: null,
        round: rounds.length + 1,
        phase: "playoff-main",
      });
    }
    rounds.push(current);
  }

  const all = rounds.flat();

  // Tercer puesto (PP de las semis)
  if (elimType === "third-place" || elimType === "consolation") {
    if (rounds.length >= 2) {
      const semis = rounds[rounds.length - 2];
      if (semis.length >= 2) {
        const s1 = semis[0];
        const s2 = semis[1];
        const code = "P" + ++matchCodeCounter;
        all.push({
          id: safeId("m"),
          code,
          zone: null,
          homeTeamId: null,
          awayTeamId: null,
          homeSeed: "PP " + s1.code,
          awaySeed: "PP " + s2.code,
          fromHomeMatchCode: s1.code,
          fromHomeResult: "PP",
          fromAwayMatchCode: s2.code,
          fromAwayResult: "PP",
          date: null,
          time: null,
          fieldId: null,
          round: rounds.length + 1,
          phase: "playoff-third",
        });
      }
    }
  }

  return all;
}

// =====================
//  ORDEN ESPECIAL EVITA 8×3
// =====================

function interleaveLists(lists) {
  const result = [];
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (const list of lists) {
      if (list.length) {
        result.push(list.shift());
        remaining = true;
      }
    }
  }
  return result;
}

function ordenarMatchesEspecial8x3(matches) {
  const fase1 = [];
  const fase2A1 = [];
  const fase2A2 = [];
  const fase2Otros = [];
  const puestos1_8 = [];
  const p9_16_r1 = [];
  const p9_16_r2 = [];
  const p9_16_r3 = [];
  const p17_24_r1 = [];
  const p17_24_r2 = [];
  const p17_24_r3 = [];
  const otros = [];

  matches.forEach((m) => {
    const phase = m.phase || "";

    if (phase.indexOf("Fase 1") !== -1) {
      // Zonas regulares 8×3
      fase1.push(m);
    } else if (phase.indexOf("Fase 2") !== -1) {
      // Zonas A1 / A2
      if (m.zone === "Zona A1") {
        fase2A1.push(m);
      } else if (m.zone === "Zona A2") {
        fase2A2.push(m);
      } else {
        fase2Otros.push(m);
      }
    } else if (phase === "Puestos 1-8") {
      puestos1_8.push(m);
    } else if (phase === "Puestos 9-16") {
      if (m.round === 1) p9_16_r1.push(m);
      else if (m.round === 2) p9_16_r2.push(m);
      else p9_16_r3.push(m);
    } else if (phase === "Puestos 17-24") {
      if (m.round === 1) p17_24_r1.push(m);
      else if (m.round === 2) p17_24_r2.push(m);
      else p17_24_r3.push(m);
    } else {
      otros.push(m);
    }
  });

  // ----------------------------
  // BLOQUE MEDIO (día 3 en adelante)
  // 1) Primeros partidos de A1/A2
  // 2) Aperturas de B y C (R1 9–16 y 17–24)
  // 3) Resto entreverado
  // ----------------------------

  // 1) 4 primeros partidos: 2 de A1 y 2 de A2 (si existen)
  const bloqueInicioF2 = [];
  for (let i = 0; i < 2; i++) {
    if (fase2A1[i]) bloqueInicioF2.push(fase2A1[i]);
    if (fase2A2[i]) bloqueInicioF2.push(fase2A2[i]);
  }

  const fase2A1Rest = fase2A1.slice(2);
  const fase2A2Rest = fase2A2.slice(2);

  // 2) Aperturas de llaves B y C: primeros partidos de R1 9–16 y 17–24
  const bloqueAperturasBC = [];
  for (let i = 0; i < 2; i++) {
    if (p9_16_r1[i]) bloqueAperturasBC.push(p9_16_r1[i]);
    if (p17_24_r1[i]) bloqueAperturasBC.push(p17_24_r1[i]);
  }

  const p9_16_r1Rest = p9_16_r1.slice(2);
  const p17_24_r1Rest = p17_24_r1.slice(2);

  // 3) Resto de A1/A2 + resto de R1 B/C entreverado
  const fase2Resto = []
    .concat(fase2A1Rest)
    .concat(fase2A2Rest)
    .concat(fase2Otros);

  const r1Resto = []
    .concat(p9_16_r1Rest)
    .concat(p17_24_r1Rest);

  const bloqueResto = interleaveLists([fase2Resto, r1Resto]);

  const bloqueMedio = []
    .concat(bloqueInicioF2)
    .concat(bloqueAperturasBC)
    .concat(bloqueResto);

  // Semis y demás rondas de B/C
  const bloqueSemis = interleaveLists([
    p9_16_r2,
    p17_24_r2,
  ]);

  // Bloque finales: 1–8 + últimos partidos de B y C
  const bloqueFinales = []
    .concat(puestos1_8)
    .concat(p9_16_r3)
    .concat(p17_24_r3);

  return []
    .concat(fase1)        // Días 1–2: zonas regulares
    .concat(bloqueMedio)  // Día 3+ intercalado A1/A2 + aperturas y resto B/C
    .concat(bloqueSemis)
    .concat(bloqueFinales)
    .concat(otros);
}



// =====================
//  SCHEDULER BÁSICO (ASIGNAR FECHAS / HORAS / CANCHAS)
// =====================
// =====================
//  LIGA CON SEEDS (SIN IDs DE EQUIPO)
// =====================

function generarLigaSeeds(seedLabels, options) {
  options = options || {};
  const idaVuelta = !!options.idaVuelta;
  const zone = options.zone || null;
  const phase = options.phase || "fase-liga";

  const seeds = seedLabels.slice();
  if (seeds.length < 2) return [];

  if (seeds.length % 2 === 1) {
    seeds.push(null);
  }

  const n = seeds.length;
  const rondas = n - 1;
  const fixtures = [];
  let arr = seeds.slice();

  for (let r = 0; r < rondas; r++) {
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i];
      const away = arr[n - 1 - i];
      if (home && away) {
        fixtures.push({
          id: safeId("m"),
          code: null,
          zone: zone,
          homeTeamId: null,
          awayTeamId: null,
          homeSeed: home,
          awaySeed: away,
          fromHomeMatchCode: null,
          fromHomeResult: null,
          fromAwayMatchCode: null,
          fromAwayResult: null,
          date: null,
          time: null,
          fieldId: null,
          round: r + 1,
          phase: phase,
        });
      }
    }
    const fixed = arr[0];
    const rotating = arr.slice(1);
    rotating.unshift(rotating.pop());
    arr = [fixed].concat(rotating);
  }

  if (idaVuelta) {
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
//  FORMATO ESPECIAL 8x3 (24 EQUIPOS)
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

  const zoneNames = Object.keys(zonesMap).sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" })
  );

  if (zoneNames.length !== 8) {
    alert(
      "El formato especial 8×3 requiere exactamente 8 zonas.\n" +
        "Actualmente se detectan " +
        zoneNames.length +
        " zonas. Verificá la columna 'Zona' de los equipos."
    );
    return [];
  }

  let totalEnZonas = 0;
  for (const z of zoneNames) {
    const count = zonesMap[z].length;
    totalEnZonas += count;
    if (count !== 3) {
      alert(
        "El formato especial 8×3 requiere que cada zona tenga exactamente 3 equipos.\n" +
          "La zona '" +
          z +
          "' tiene " +
          count +
          " equipos."
      );
      return [];
    }
  }

  if (totalEnZonas !== t.teams.length) {
    alert(
      "Hay equipos sin zona asignada o con una zona distinta de las 8 definidas.\n" +
        "Equipos totales: " +
        t.teams.length +
        " · Equipos en zonas válidas: " +
        totalEnZonas +
        "."
    );
    return [];
  }

  const idaVuelta = !!(
    t.format &&
    t.format.liga &&
    t.format.liga.rounds === "ida-vuelta"
  );

  const allMatches = [];

  // ---------------------
  // FASE 1: ZONAS INICIALES (8×3)
  // ---------------------
  const fase1 = generarFixtureZonas(zonesMap, {
    idaVuelta: idaVuelta,
  });
  fase1.forEach((m) => {
    m.phase = "Fase 1 · zonas (8×3)";
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

  const seedsA1 = ["1° " + z1, "1° " + z3, "1° " + z5, "1° " + z7];
  const seedsA2 = ["1° " + z2, "1° " + z4, "1° " + z6, "1° " + z8];

  const zonaA1 = generarLigaSeeds(seedsA1, {
    idaVuelta: idaVuelta,
    zone: "Zona A1",
    phase: "Fase 2 · Zona A1 (1° de zonas)",
  });
  const zonaA2 = generarLigaSeeds(seedsA2, {
    idaVuelta: idaVuelta,
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
      awaySeed: posicion + "° Zona A2",
      fromHomeMatchCode: null,
      fromHomeResult: null,
      fromAwayMatchCode: null,
      fromAwayResult: null,
      date: null,
      time: null,
      fieldId: null,
      round: 1,
      phase: "Puestos 1-8",
    };
  }

  allMatches.push(
    crearPartidoPosicion(1),
    crearPartidoPosicion(2),
    crearPartidoPosicion(3),
    crearPartidoPosicion(4)
  );

  // ---------------------
  // FASE 4: PUESTOS 9–16 (2° de zonas)
  // ---------------------
  function crearMatchClasif(code, homeSeed, awaySeed, round, phase, zone) {
    return {
      id: safeId("m"),
      code: code,
      zone: zone,
      homeTeamId: null,
      awayTeamId: null,
      homeSeed: homeSeed,
      awaySeed: awaySeed,
      fromHomeMatchCode: null,
      fromHomeResult: null,
      fromAwayMatchCode: null,
      fromAwayResult: null,
      date: null,
      time: null,
      fieldId: null,
      round: round,
      phase: phase,
    };
  }

  function crearMatchDesdeGP_PP(
    code,
    fromCodeHome,
    fromResHome,
    fromCodeAway,
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

  const phase9_16 = "Puestos 9-16";
  const zone9_16 = "Puestos 9-16";

  // Ronda 1 (2° de zonas)
  const m9_1 = crearMatchClasif(
    "P9_1",
    "2° " + z1,
    "2° " + z3,
    1,
    phase9_16,
    zone9_16
  );
  const m9_2 = crearMatchClasif(
    "P9_2",
    "2° " + z5,
    "2° " + z7,
    1,
    phase9_16,
    zone9_16
  );
  const m9_3 = crearMatchClasif(
    "P9_3",
    "2° " + z2,
    "2° " + z4,
    1,
    phase9_16,
    zone9_16
  );
  const m9_4 = crearMatchClasif(
    "P9_4",
    "2° " + z6,
    "2° " + z8,
    1,
    phase9_16,
    zone9_16
  );

  // Ronda 2 (ganadores y perdedores)
  const m9_5 = crearMatchDesdeGP_PP(
    "P9_5",
    m9_1.code,
    "GP",
    m9_2.code,
    "GP",
    2,
    phase9_16,
    zone9_16
  );
  const m9_6 = crearMatchDesdeGP_PP(
    "P9_6",
    m9_3.code,
    "GP",
    m9_4.code,
    "GP",
    2,
    phase9_16,
    zone9_16
  );
  const m9_7 = crearMatchDesdeGP_PP(
    "P9_7",
    m9_1.code,
    "PP",
    m9_2.code,
    "PP",
    2,
    phase9_16,
    zone9_16
  );
  const m9_8 = crearMatchDesdeGP_PP(
    "P9_8",
    m9_3.code,
    "PP",
    m9_4.code,
    "PP",
    2,
    phase9_16,
    zone9_16
  );

  // Ronda 3 (definición de 9–16)
  const m9_9 = crearMatchDesdeGP_PP(
    "P9_9",
    m9_5.code,
    "GP",
    m9_6.code,
    "GP",
    3,
    phase9_16,
    zone9_16
  );
  const m9_10 = crearMatchDesdeGP_PP(
    "P9_10",
    m9_5.code,
    "PP",
    m9_6.code,
    "PP",
    3,
    phase9_16,
    zone9_16
  );
  const m9_11 = crearMatchDesdeGP_PP(
    "P9_11",
    m9_7.code,
    "GP",
    m9_8.code,
    "GP",
    3,
    phase9_16,
    zone9_16
  );
  const m9_12 = crearMatchDesdeGP_PP(
    "P9_12",
    m9_7.code,
    "PP",
    m9_8.code,
    "PP",
    3,
    phase9_16,
    zone9_16
  );

  allMatches.push(
    m9_1,
    m9_2,
    m9_3,
    m9_4,
    m9_5,
    m9_6,
    m9_7,
    m9_8,
    m9_9,
    m9_10,
    m9_11,
    m9_12
  );

  // ---------------------
  // FASE 5: PUESTOS 17–24 (3° de zonas)
  // ---------------------
  const phase17_24 = "Puestos 17-24";
  const zone17_24 = "Puestos 17-24";

  const m17_1 = crearMatchClasif(
    "P17_1",
    "3° " + z1,
    "3° " + z3,
    1,
    phase17_24,
    zone17_24
  );
  const m17_2 = crearMatchClasif(
    "P17_2",
    "3° " + z5,
    "3° " + z7,
    1,
    phase17_24,
    zone17_24
  );
  const m17_3 = crearMatchClasif(
    "P17_3",
    "3° " + z2,
    "3° " + z4,
    1,
    phase17_24,
    zone17_24
  );
  const m17_4 = crearMatchClasif(
    "P17_4",
    "3° " + z6,
    "3° " + z8,
    1,
    phase17_24,
    zone17_24
  );

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
    m17_2.code,
    "PP",
    2,
    phase17_24,
    zone17_24
  );
  const m17_8 = crearMatchDesdeGP_PP(
    "P17_8",
    m17_3.code,
    "PP",
    m17_4.code,
    "PP",
    2,
    phase17_24,
    zone17_24
  );

  const m17_9 = crearMatchDesdeGP_PP(
    "P17_9",
    m17_5.code,
    "GP",
    m17_6.code,
    "GP",
    3,
    phase17_24,
    zone17_24
  );
  const m17_10 = crearMatchDesdeGP_PP(
    "P17_10",
    m17_5.code,
    "PP",
    m17_6.code,
    "PP",
    3,
    phase17_24,
    zone17_24
  );
  const m17_11 = crearMatchDesdeGP_PP(
    "P17_11",
    m17_7.code,
    "GP",
    m17_8.code,
    "GP",
    3,
    phase17_24,
    zone17_24
  );
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

  return allMatches;
}
function asignarHorarios(matches, options) {
  if (!matches || !matches.length) return matches || [];

  options = options || {};

  const dur = options.matchDurationMinutes || 60;
  const rest = options.restMinMinutes || 0;

  // Detectamos si estamos en el modelo Evita 24 equipos 8×3
  const isEvita = matches.some((m) => {
    const phase = (m.phase || "").toLowerCase();
    const zone = (m.zone || "").toLowerCase();
    return (
      phase.includes("fase 1") ||
      phase.includes("fase 2") ||
      phase.includes("puestos 1-8") ||
      phase.includes("puestos 9-16") ||
      phase.includes("puestos 17-24") ||
      zone === "zona a1" ||
      zone === "zona a2"
    );
  });

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
  } else {
    fields = [{ id: safeId("field"), name: "Cancha 1", maxMatchesPerDay: null }];
  }

  // =====================
  //  CORTES HORARIOS
  // =====================
  const cortes = Array.isArray(options.breaks)
    ? options.breaks
        .map((b) => {
          const from = parseTimeToMinutes(b.from);
          const to = parseTimeToMinutes(b.to);
          if (from === null || to === null || to <= from) return null;
          return { from, to };
        })
        .filter(Boolean)
    : [];

  // =====================
  //  SLOTS DISPONIBLES
  // =====================
  const slots = [];
  let numDays = 0;

  const dayConfigs =
    Array.isArray(options.dayConfigs) && options.dayConfigs.length
      ? options.dayConfigs
      : null;

  if (dayConfigs) {
    numDays = dayConfigs.length;

    dayConfigs.forEach((dc, dayIdx) => {
      if (!dc || dc.type === "off") return; // Día sin juego

      const dateStr =
        dc.date ||
        (options.dateStart
          ? formatDate(addDays(dateStrToDate(options.dateStart), dayIdx))
          : "");

      const timeMinStr = dc.timeMin || options.dayTimeMin || "09:00";
      const timeMaxStr = dc.timeMax || options.dayTimeMax || "22:00";

      const minMin = parseTimeToMinutes(timeMinStr);
      const maxMin = parseTimeToMinutes(timeMaxStr);
      if (minMin === null || maxMin === null || maxMin <= minMin) return;

      const base = dayIdx * 24 * 60;

      for (let t = minMin; t + dur <= maxMin; t += dur) {
        const inBreak = cortes.some(
          (c) => !(t + dur <= c.from || t >= c.to)
        );
        if (inBreak) continue;

        fields.forEach((field) => {
          slots.push({
            date: dateStr,
            dayIndex: dayIdx,
            absoluteStart: base + t,
            startMinutes: t,
            fieldId: field.id,
          });
        });
      }
    });
  } else {
    // Fallback: rango global por fechas si no tenemos dayConfigs
    const dateStartObj = options.dateStart
      ? dateStrToDate(options.dateStart)
      : null;
    const dateEndObj = options.dateEnd
      ? dateStrToDate(options.dateEnd)
      : null;

    if (!dateStartObj || !dateEndObj || dateEndObj < dateStartObj) {
      console.warn("Rango de fechas inválido; partidos sin programar");
      return matches;
    }

    const minMin = parseTimeToMinutes(options.dayTimeMin || "09:00");
    const maxMin = parseTimeToMinutes(options.dayTimeMax || "22:00");
    if (minMin === null || maxMin === null || maxMin <= minMin) {
      console.warn("Horario diario inválido; partidos sin programar");
      return matches;
    }

    let dayIdx = 0;
    for (
      let d = new Date(dateStartObj.getTime());
      d <= dateEndObj;
      d = addDays(d, 1), dayIdx++
    ) {
      const dateStr = formatDate(d);
      const base = dayIdx * 24 * 60;

      for (let t = minMin; t + dur <= maxMin; t += dur) {
        const inBreak = cortes.some(
          (c) => !(t + dur <= c.from || t >= c.to)
        );
        if (inBreak) continue;

        fields.forEach((field) => {
          slots.push({
            date: dateStr,
            dayIndex: dayIdx,
            absoluteStart: base + t,
            startMinutes: t,
            fieldId: field.id,
          });
        });
      }
    }
    numDays = slots.reduce(
      (max, s) =>
        typeof s.dayIndex === "number"
          ? Math.max(max, s.dayIndex + 1)
          : max,
      0
    );
  }

  if (!slots.length) {
    console.warn("Sin slots disponibles; partidos sin programar");
    return matches;
  }

  // Ordenamos slots por tiempo absoluto por las dudas
  slots.sort((a, b) => a.absoluteStart - b.absoluteStart);

  const used = new Array(slots.length).fill(false);
  const lastEnd = {}; // último final por equipo

  // =====================
  //  VENTANAS POR FASE (Evita)
  // =====================
  function getPhaseDayWindow(m, numDays) {
    const lastIndex = Math.max(0, numDays - 1);
    if (!isEvita || numDays < 3) {
      return { minDay: 0, maxDay: lastIndex };
    }

    const phase = (m.phase || "").toLowerCase();
    const zone = (m.zone || "").toLowerCase();

    // Fase 1: SOLO días 1-2
    if (phase.includes("fase 1")) {
      return {
        minDay: 0,
        maxDay: Math.min(1, lastIndex),
      };
    }

    // Fase 2 (A1/A2): a partir del día 3 (días 3-4)
    if (
      phase.includes("fase 2") ||
      zone === "zona a1" ||
      zone === "zona a2"
    ) {
      const min = Math.min(2, lastIndex);
      const max = Math.min(3, lastIndex);
      return { minDay: min, maxDay: max };
    }

    // Puestos 9-16 y 17-24: días 3-5 (o hasta el final si hay menos)
    if (
      phase.indexOf("puestos 9-16") !== -1 ||
      phase.indexOf("puestos 17-24") !== -1
    ) {
      const min = Math.min(2, lastIndex);
      const max = Math.min(4, lastIndex);
      return { minDay: min, maxDay: max };
    }

    // Puestos 1-8: desde día 4 en adelante
    if (phase.indexOf("puestos 1-8") !== -1) {
      const min = Math.min(3, lastIndex);
      return { minDay: min, maxDay: lastIndex };
    }

    // Cualquier otra cosa: sin restricciones especiales
    return { minDay: 0, maxDay: lastIndex };
  }

  // =====================
  //  ELECCIÓN DEL MEJOR SLOT (maximo descanso)
  // =====================
  function chooseSlotForMatch(m) {
    const home = m.homeTeamId;
    const away = m.awayTeamId;

    const window = getPhaseDayWindow(m, numDays);
    let bestIndex = -1;
    let bestRestScore = -Infinity;

    for (let i = 0; i < slots.length; i++) {
      if (used[i]) continue;
      const s = slots[i];

      if (
        typeof s.dayIndex === "number" &&
        (s.dayIndex < window.minDay || s.dayIndex > window.maxDay)
      ) {
        continue;
      }

      const startAbs = s.absoluteStart;
      const endAbs = s.absoluteStart + dur;

      let restScore = Number.POSITIVE_INFINITY;

      if (home) {
        const lastH = lastEnd[home] ?? -Infinity;
        const diffH = startAbs - lastH;
        if (diffH < rest) continue;
        restScore = Math.min(restScore, diffH);
      }
      if (away) {
        const lastA = lastEnd[away] ?? -Infinity;
        const diffA = startAbs - lastA;
        if (diffA < rest) continue;
        restScore = Math.min(restScore, diffA);
      }

      // Queremos la MAYOR separación posible entre partidos del mismo equipo.
      if (
        restScore > bestRestScore ||
        (restScore === bestRestScore &&
          bestIndex >= 0 &&
          s.absoluteStart < slots[bestIndex].absoluteStart)
      ) {
        bestRestScore = restScore;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) return null;

    const chosenSlot = slots[bestIndex];
    used[bestIndex] = true;

    const endAbs = chosenSlot.absoluteStart + dur;
    if (home) lastEnd[home] = endAbs;
    if (away) lastEnd[away] = endAbs;

    return chosenSlot;
  }

  // =====================
  //  PROGRAMACIÓN
  // =====================
  const scheduled = matches.map((m) => {
    const slot = chooseSlotForMatch(m);

    if (!slot) {
      // No encontró slot dentro de su ventana: lo dejamos sin programar
      return Object.assign({}, m, {
        date: null,
        time: null,
        fieldId: null,
      });
    }

    return Object.assign({}, m, {
      date: slot.date,
      time: minutesToTimeStr(slot.startMinutes),
      fieldId: slot.fieldId,
    });
  });

  return scheduled;
}




// =====================
//  RENUMERAR PARTIDOS CON IDs NUMÉRICOS
// =====================

function renumerarPartidosConIdsNumericos(matches) {
  const codeMap = {};

  // 1) Asignar nuevo código numérico a TODOS los partidos
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const newCode = String(i + 1); // "1", "2", "3", ...
    const oldCode = m.code || null;

    if (oldCode) {
      codeMap[oldCode] = newCode; // P1 -> 5, etc.
    }
    m.code = newCode;
  }

  // 2) Actualizar referencias GP/PP y from*MatchCode que usaban los códigos viejos
  matches.forEach((m) => {
    if (m.homeSeed) {
      m.homeSeed = reemplazarCodigoEnSeed(m.homeSeed, codeMap);
    }
    if (m.awaySeed) {
      m.awaySeed = reemplazarCodigoEnSeed(m.awaySeed, codeMap);
    }

    if (m.fromHomeMatchCode && codeMap[m.fromHomeMatchCode]) {
      m.fromHomeMatchCode = codeMap[m.fromHomeMatchCode];
    }
    if (m.fromAwayMatchCode && codeMap[m.fromAwayMatchCode]) {
      m.fromAwayMatchCode = codeMap[m.fromAwayMatchCode];
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
    if (String(n) === "6") {
      renderExportView(currentExportMode || "zone");
    }
  }

  stepItems.forEach((li) =>
    li.addEventListener("click", () => showStep(li.dataset.step))
  );
  document.querySelectorAll("[data-next-step]").forEach((btn) =>
    btn.addEventListener("click", () => showStep(btn.dataset.nextStep))
  );
  document.querySelectorAll("[data-prev-step]").forEach((btn) =>
    btn.addEventListener("click", () => showStep(btn.dataset.prevStep))
  );

  const btnNew = document.getElementById("btn-new-tournament");
  const btnList = document.getElementById("btn-tournament-list");

  btnNew &&
    btnNew.addEventListener("click", () => {
      startNewTournament();
      showStep(1);
    });

  btnList &&
    btnList.addEventListener("click", () => {
      openTournamentsModal();
    });

}

// =====================
//  STEP 1: DATOS GENERALES
// =====================

function initStep1() {
  ["t-name", "t-category", "t-date-start", "t-date-end", "t-storage-mode"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        const t = appState.currentTournament;
        if (!t) return;
        t.name = document.getElementById("t-name").value.trim();
        t.category = document.getElementById("t-category").value.trim();
        t.dateStart = document.getElementById("t-date-start").value;
        t.dateEnd = document.getElementById("t-date-end").value;
        t.storageMode = document.getElementById("t-storage-mode").value;
        upsertCurrentTournament();
      });
    }
  );
}

function syncUIFromState_step1() {
  const t = appState.currentTournament;
  if (!t) return;
  document.getElementById("t-name").value = t.name || "";
  document.getElementById("t-category").value = t.category || "";
  document.getElementById("t-date-start").value = t.dateStart || "";
  document.getElementById("t-date-end").value = t.dateEnd || "";
  document.getElementById("t-storage-mode").value = t.storageMode || "local";
}

// =====================
//  STEP 2: EQUIPOS
// =====================

function initTeamsSection() {
  const btnAddTeam = document.getElementById("btn-add-team");
  const btnImportCsv = document.getElementById("btn-import-csv");
  const fileInput = document.getElementById("teams-csv-input");

  btnAddTeam &&
    btnAddTeam.addEventListener("click", () => {
      const t = appState.currentTournament;
      if (!t) return;

      const shortName = document.getElementById("team-short").value.trim();
      const longName = document.getElementById("team-long").value.trim();
      const origin = document.getElementById("team-origin").value.trim();
      const category = document.getElementById("team-category").value.trim();
      const zone = document.getElementById("team-zone").value.trim();

      if (!shortName) {
        alert("Ingresá al menos el nombre corto del equipo.");
        return;
      }

      t.teams.push({
        id: safeId("team"),
        shortName: shortName,
        longName: longName || shortName,
        origin: origin,
        category: category,
        zone: zone,
      });

      upsertCurrentTournament();
      renderTeamsTable();
      clearTeamInputs();
    });

  btnImportCsv &&
    btnImportCsv.addEventListener("click", () => {
      fileInput && fileInput.click();
    });

  fileInput &&
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        importTeamsFromCsv(ev.target.result);
      };
      reader.readAsText(file, "utf-8");
    });

  renderTeamsTable();
}

function renderTeamsTable() {
  const tbody = document.querySelector("#teams-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const t = appState.currentTournament;
  if (!t) return;

  t.teams.forEach((team, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      (index + 1) +
      "</td>" +
      "<td>" +
      (team.zone || "-") +
      "</td>" +
      "<td>" +
      team.shortName +
      "</td>" +
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
  }

  const t = appState.currentTournament;
  if (!t) return;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const shortName = (cols[teamIdx] || "").trim();
    if (!shortName) continue;
    const zone = zoneIdx !== -1 ? (cols[zoneIdx] || "").trim() : "";

    t.teams.push({
      id: safeId("team"),
      shortName: shortName,
      longName: shortName,
      origin: "",
      category: "",
      zone: zone,
    });
  }

  upsertCurrentTournament();
  renderTeamsTable();
  alert(
    "Equipos importados (stub CSV). Ajustaremos al formato real más adelante."
  );
}

// =====================
//  STEP 3: FORMATO
// =====================

function initFormatSection() {
  const formatSelect = document.getElementById("t-format-type");
  const ligaRounds = document.getElementById("liga-rounds");
  const zonasQualifiers = document.getElementById("zonas-qualifiers");
  const zonasBestPlaces = document.getElementById("zonas-best-places");
  const elimType = document.getElementById("elim-type");
  const avoidSameProvince = document.getElementById("avoid-same-province");
  const avoidSameClub = document.getElementById("avoid-same-club");
  const avoidFirstSlot = document.getElementById("avoid-first-slot-streak");
  const avoidLastSlot = document.getElementById("avoid-last-slot-streak");

  function refreshFormatPanels(typeValue) {
    const type = typeValue || (formatSelect ? formatSelect.value : "liga");
    const ligaPanel = document.getElementById("format-liga-options");
    const zonasPanel = document.getElementById("format-zonas-options");
    const elimPanel = document.getElementById("format-elim-options");

    if (ligaPanel) {
      ligaPanel.style.display =
        type === "liga" || type === "especial-8x3" ? "block" : "none";
    }
    if (zonasPanel) {
      zonasPanel.style.display =
        type === "zonas" || type === "zonas-playoffs" ? "block" : "none";
    }
    if (elimPanel) {
      elimPanel.style.display =
        type === "eliminacion" || type === "zonas-playoffs" ? "block" : "none";
    }
  }

  function syncFromState() {
    const t = appState.currentTournament;
    if (!t) return;

    const fmt = t.format || {};

    if (formatSelect) {
      formatSelect.value = fmt.type || "liga";
    }
    if (ligaRounds) {
      ligaRounds.value =
        fmt.liga && fmt.liga.rounds ? fmt.liga.rounds : "ida";
    }
    if (zonasQualifiers) {
      const val =
        fmt.zonas && typeof fmt.zonas.qualifiersPerZone === "number"
          ? fmt.zonas.qualifiersPerZone
          : 2;
      zonasQualifiers.value = String(val);
    }
    if (zonasBestPlaces) {
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
      t.format.liga.rounds = ligaRounds.value;
    }
    if (zonasQualifiers) {
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
    }
    // Recortar si había más días que los actuales
    field.daysEnabled = field.daysEnabled.slice(0, dayConfigs.length);
  });

  let html = '<table class="data-table">';
  html += "<thead><tr><th>Cancha</th>";
  dayConfigs.forEach((dc, idx) => {
    html += "<th>Día " + (dc.index || idx + 1) + "</th>";
  });
  html += "</tr></thead><tbody>";

  fields.forEach((field) => {
    html += "<tr>";
    html += "<td>" + (field.name || "(sin nombre)") + "</td>";
    dayConfigs.forEach((dc, dayIdx) => {
      const checked =
        !Array.isArray(field.daysEnabled) ||
        field.daysEnabled[dayIdx] !== false
          ? "checked"
          : "";
      html +=
        '<td style="text-align:center;"><input type="checkbox" class="field-day-toggle" data-field-id="' +
        field.id +
        '" data-day-idx="' +
        dayIdx +
        '" ' +
        checked +
        "></td>";
    });
    html += "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  container.querySelectorAll(".field-day-toggle").forEach((chk) => {
    chk.addEventListener("change", () => {
      const fieldId = chk.getAttribute("data-field-id");
      const dayIdx = parseInt(chk.getAttribute("data-day-idx"), 10);
      const field = t.fields.find((f) => f.id === fieldId);
      if (!field) return;
      if (!Array.isArray(field.daysEnabled)) {
        field.daysEnabled = [];
      }
      field.daysEnabled[dayIdx] = chk.checked;
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  });
}



// Engancha cambios de fechas del Paso 1, genera los días
// y refresca la tabla + la matriz de canchas.
function initScheduleDaysUI() {
  const startInput = document.getElementById("t-date-start");
  const endInput = document.getElementById("t-date-end");

  if (startInput) {
    startInput.addEventListener("change", () => {
      const t = appState.currentTournament;
      if (!t) return;
      t.dateStart = startInput.value || "";
      ensureDayConfigs(t);
      renderDayConfigs();
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  }

  if (endInput) {
    endInput.addEventListener("change", () => {
      const t = appState.currentTournament;
      if (!t) return;
      t.dateEnd = endInput.value || "";
      ensureDayConfigs(t);
      renderDayConfigs();
      if (typeof upsertCurrentTournament === "function") {
        upsertCurrentTournament();
      }
    });
  }

  // Primer render al cargar
  renderDayConfigs();
}


function initFieldsSection() {
  const btnAddField = document.getElementById("btn-add-field");
  btnAddField &&
    btnAddField.addEventListener("click", () => {
      const t = appState.currentTournament;
      if (!t) return;
      const name = document.getElementById("field-name").value.trim();
      const maxMatches = Number(
        document.getElementById("field-max-matches").value || 0
      );
      if (!name) {
        alert("Ingresá un nombre de cancha.");
        return;
      }
      t.fields.push({
        id: safeId("field"),
        name: name,
        maxMatchesPerDay: maxMatches > 0 ? maxMatches : null,
      });
      upsertCurrentTournament();
      renderFieldsTable();
      document.getElementById("field-name").value = "";
      document.getElementById("field-max-matches").value = "";
    });

  ["day-time-min", "day-time-max", "match-duration", "rest-min"].forEach(
    (id) => {
      const el = document.getElementById(id);
      el &&
        el.addEventListener("change", () => {
          const t = appState.currentTournament;
          if (!t) return;
          t.dayTimeMin =
            document.getElementById("day-time-min").value || "09:00";
          t.dayTimeMax =
            document.getElementById("day-time-max").value || "22:00";
          t.matchDurationMinutes = Number(
            document.getElementById("match-duration").value || 60
          );
          t.restMinMinutes = Number(
            document.getElementById("rest-min").value || 90
          );
          upsertCurrentTournament();
        });
    }
  );

  renderFieldsTable();
}

function renderFieldsTable() {
  const tbody = document.querySelector("#fields-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const t = appState.currentTournament;
  if (!t) return;

  t.fields.forEach((field, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      (index + 1) +
      "</td>" +
      "<td>" +
      field.name +
      "</td>" +
      "<td>" +
      (field.maxMatchesPerDay ?? "-") +
      "</td>" +
      '<td><button class="btn ghost btn-sm" data-remove-field="' +
      field.id +
      '">✕</button></td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-field]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-field");
      const t = appState.currentTournament;
      if (!t) return;
      t.fields = t.fields.filter((f) => f.id !== id);
      upsertCurrentTournament();
      renderFieldsTable();
    });
  });
  // Al actualizar la tabla de canchas, refrescamos la matriz de disponibilidad
  renderFieldDaysMatrix();
}

function initBreaksSection() {
  const btnAddBreak = document.getElementById("btn-add-break");
  btnAddBreak &&
    btnAddBreak.addEventListener("click", () => {
      const t = appState.currentTournament;
      if (!t) return;
      const from = document.getElementById("break-from").value;
      const to = document.getElementById("break-to").value;
      if (!from || !to) {
        alert("Definí un rango de horas para el corte.");
        return;
      }
      t.breaks.push({ from: from, to: to });
      upsertCurrentTournament();
      renderBreaksList();
    });

  renderBreaksList();
}

function renderBreaksList() {
  const ul = document.getElementById("breaks-list");
  if (!ul) return;
  const t = appState.currentTournament;
  if (!t) return;

  ul.innerHTML = ""; // limpiar antes de repintar

  t.breaks.forEach((b, idx) => {
    const li = document.createElement("li");
    li.textContent = "Corte " + (idx + 1) + ": " + b.from + "–" + b.to;
    ul.appendChild(li);
  });
}


// =====================
//  STEP 5: GENERAR FIXTURE
// =====================

function initFixtureGeneration() {
  const btn = document.getElementById("btn-generate-fixture");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const t = appState.currentTournament;
    if (!t) return;

    if (!t.teams.length) {
      alert("Primero cargá equipos.");
      return;
    }

    // 👉 NUEVO: tomamos los inputs del Paso 4
    const dayTimeMinInput = document.getElementById("day-time-min");
    const dayTimeMaxInput = document.getElementById("day-time-max");
    const matchDurationInput = document.getElementById("match-duration");
    const restMinInput = document.getElementById("rest-min");

    const dayTimeMin =
      (dayTimeMinInput && dayTimeMinInput.value) ||
      t.dayTimeMin ||
      "09:00";

    const dayTimeMax =
      (dayTimeMaxInput && dayTimeMaxInput.value) ||
      t.dayTimeMax ||
      "22:00";

    const matchDurationMinutes = Number(
      (matchDurationInput && matchDurationInput.value) ||
        t.matchDurationMinutes ||
        60
    );

    const restMinMinutes = Number(
      (restMinInput && restMinInput.value) ||
        t.restMinMinutes ||
        0
    );

    // Actualizamos el torneo con esos valores
    t.dayTimeMin = dayTimeMin;
    t.dayTimeMax = dayTimeMax;
    t.matchDurationMinutes = matchDurationMinutes;
    t.restMinMinutes = restMinMinutes;

    // 👉 NUEVO: puente entre t.dayConfigs y t.schedule.dayConfigs
    const dayConfigsFromState =
      (Array.isArray(t.dayConfigs) && t.dayConfigs.length)
        ? t.dayConfigs
        : (t.schedule &&
           Array.isArray(t.schedule.dayConfigs) &&
           t.schedule.dayConfigs.length
          ? t.schedule.dayConfigs
          : []);

   const scheduleOptions = {
  dateStart: t.dateStart,
  dateEnd: t.dateEnd,
  dayTimeMin,
  dayTimeMax,
  matchDurationMinutes,
  restMinMinutes,
  fields: t.fields || [],
  breaks: t.breaks || [],
  restrictions: t.format ? t.format.restrictions : null,
    dayConfigs:
          t.schedule && Array.isArray(t.schedule.dayConfigs)
            ? t.schedule.dayConfigs
            : [],
};

    let matchesBase = [];

    if (t.format.type === "liga") {
      const ids = t.teams.map((e) => e.id);
      matchesBase = generarFixtureLiga(ids, {
        idaVuelta: t.format.liga.rounds === "ida-vuelta",
      });
    } else if (t.format.type === "zonas") {
      const zonesMap = {};
      t.teams.forEach((team) => {
        const key = team.zone || "Zona";
        if (!zonesMap[key]) zonesMap[key] = [];
        zonesMap[key].push(team.id);
      });
      matchesBase = generarFixtureZonas(zonesMap, {
        idaVuelta: t.format.liga.rounds === "ida-vuelta",
      });
    } else if (t.format.type === "zonas-playoffs") {
      const zonesMap = {};
      t.teams.forEach((team) => {
        const key = team.zone || "Zona";
        if (!zonesMap[key]) zonesMap[key] = [];
        zonesMap[key].push(team.id);
      });
      const baseZonas = generarFixtureZonas(zonesMap, {
        idaVuelta: t.format.liga.rounds === "ida-vuelta",
      });
      const playoffs = generarPlayoffsDesdeZonas(
        t,
        t.format.eliminacion.type
      );
      matchesBase = baseZonas.concat(playoffs);
    } else if (t.format.type === "especial-8x3") {
      // Formato especial 24 equipos · 8×3 (modelo Evita)
      matchesBase = generarPartidosDesdeModeloEvita(
        t,
        "EVITA_24_8x3_NORMAL_5D_2C"
      );

      if (!matchesBase || !matchesBase.length) {
        // generarPartidosDesdeModeloEvita ya avisa si algo falla
        return;
      }

      console.log(
        "DEBUG ESPECIAL-8x3 → equipos:",
        t.teams.length,
        "partidos generados (antes de ordenar):",
        matchesBase.length
      );
    } else if (t.format.type === "eliminacion") {
      const ids = t.teams.map((e) => e.id);
      matchesBase = generarLlavesEliminacion(ids, {
        type: t.format.eliminacion.type,
      });
    }

    // IDs numéricos globales
    matchesBase = renumerarPartidosConIdsNumericos(matchesBase);

    // Asignar fechas / horas / canchas
    const matches = asignarHorarios(matchesBase, scheduleOptions);
    t.matches = matches;
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
    "<th>ID</th>" +
    "<th>Zona</th>" +
    "<th>Fecha</th>" +
    "<th>Hora</th>" +
    "<th>Cancha</th>" +
    "<th>Partido</th>" +
    "<th>Fase / Ronda</th>" +
    "</tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  t.matches.forEach((m, idx) => {
    const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
    const away = m.awayTeamId ? teamById[m.awayTeamId] : null;

    const homeLabel = home ? home.shortName : m.homeSeed || "?";
    const awayLabel = away ? away.shortName : m.awaySeed || "?";

    const field =
      m.fieldId && fieldById[m.fieldId] ? fieldById[m.fieldId].name : m.fieldId;

    const phaseRoundLabel =
      (m.phase || "") +
      " (R" +
      (m.round || "-") +
      (m.code ? " · " + m.code : "") +
      ")";

    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" +
      (idx + 1) +
      "</td>" +
      "<td>" +
      (m.code || "-") +
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
      (field || "-") +
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

  container.innerHTML = "";
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

    grouped[key].forEach((m) => {
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
          (m.code || "-") +
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
          (m.code || "-") +
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

  t.matches.forEach((m, idx) => {
    const home = m.homeTeamId ? teamById[m.homeTeamId] : null;
    const away = m.awayTeamId ? teamById[m.awayTeamId] : null;
    const homeLabel = home ? home.shortName : m.homeSeed || "";
    const awayLabel = away ? away.shortName : m.awaySeed || "";
    const field =
      m.fieldId && fieldById[m.fieldId]
        ? fieldById[m.fieldId].name
        : m.fieldId || "";

    rows.push(
      [
        String(idx + 1),
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
