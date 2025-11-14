// app.js v0.5
// - Generación de fixture (liga / zonas / eliminación)
// - Scheduler básico
// - Vistas por zona / día / cancha / equipo
// - Exportar CSV, PNG, PDF (texto con jsPDF + autoTable)
// - Playoffs automáticos desde zonas con IDs de partido (P1, P2...) y refs GP / PP

// =====================
//  ESTADO GLOBAL
// =====================

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
//  SCHEDULER BÁSICO (ASIGNAR FECHAS / HORAS / CANCHAS)
// =====================

function asignarHorarios(matches, options) {
  if (!matches.length) return matches;

  const dateStartObj = dateStrToDate(options.dateStart);
  const dateEndObj = dateStrToDate(options.dateEnd);
  if (!dateStartObj || !dateEndObj || dateEndObj < dateStartObj) {
    console.warn("Rango de fechas inválido; partidos sin programar");
    return matches;
  }

  const minMin = parseTimeToMinutes(options.dayTimeMin || "09:00");
  const maxMin = parseTimeToMinutes(options.dayTimeMax || "22:00");
  const dur = options.matchDurationMinutes || 60;
  const rest = options.restMinMinutes || 0;

  if (minMin === null || maxMin === null || maxMin <= minMin) {
    console.warn("Horario diario inválido; partidos sin programar");
    return matches;
  }

  let fields =
    Array.isArray(options.fields) && options.fields.length
      ? options.fields.slice()
      : [{ id: safeId("field"), name: "Cancha 1", maxMatchesPerDay: null }];

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

  const slots = [];
  let dayIndex = 0;
  for (
    let d = new Date(dateStartObj.getTime());
    d <= dateEndObj;
    d = addDays(d, 1), dayIndex++
  ) {
    const dateStr = formatDate(d);
    const base = dayIndex * 24 * 60;
    for (let t = minMin; t + dur <= maxMin; t += dur) {
      const start = t;
      const end = t + dur;
      const inBreak = cortes.some((c) => !(end <= c.from || start >= c.to));
      if (inBreak) continue;
      for (const field of fields) {
        slots.push({
          date: dateStr,
          absoluteStart: base + start,
          startMinutes: start,
          fieldId: field.id,
        });
      }
    }
  }

  if (!slots.length) {
    console.warn("Sin slots disponibles; partidos sin programar");
    return matches;
  }

  const used = new Array(slots.length).fill(false);
  const lastEnd = {};

  const scheduled = matches.map((m) => {
    const home = m.homeTeamId;
    const away = m.awayTeamId;
    let chosen = -1;

    for (let i = 0; i < slots.length; i++) {
      if (used[i]) continue;
      const s = slots[i];
      const startAbs = s.absoluteStart;
      const endAbs = s.absoluteStart + dur;

      if (home) {
        const lastH = lastEnd[home] ?? -Infinity;
        if (startAbs - lastH < rest) continue;
      }
      if (away) {
        const lastA = lastEnd[away] ?? -Infinity;
        if (startAbs - lastA < rest) continue;
      }

      chosen = i;
      if (home) lastEnd[home] = endAbs;
      if (away) lastEnd[away] = endAbs;
      used[i] = true;
      break;
    }

    if (chosen === -1) {
      return Object.assign({}, m, { date: null, time: null, fieldId: null });
    } else {
      const s = slots[chosen];
      return Object.assign({}, m, {
        date: s.date,
        time: minutesToTimeStr(s.startMinutes),
        fieldId: s.fieldId,
      });
    }
  });

  return scheduled;
}

// =====================
//  INICIALIZACIÓN GENERAL
// =====================

document.addEventListener("DOMContentLoaded", () => {
  loadTournamentsFromLocalStorage();
  startNewTournament();
  initNavigation();
  initStep1();
  initTeamsSection();
  initFieldsSection();
  initBreaksSection();
  initFormatSection();
  initFixtureGeneration();
  initReportsAndExport();
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
      const names = appState.tournaments
        .map((t) => "• " + (t.name || "(sin nombre)") + " (" + t.id + ")")
        .join("\n");
      alert(
        appState.tournaments.length
          ? "Torneos guardados en este navegador:\n\n" + names
          : "Todavía no hay torneos guardados en este navegador."
      );
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

  function updateFormat() {
    const t = appState.currentTournament;
    if (!t) return;
    t.format.type = formatSelect.value;
    t.format.liga.rounds = ligaRounds.value;
    t.format.zonas.qualifiersPerZone = Number(zonasQualifiers.value || 2);
    t.format.zonas.bestPlacesMode = zonasBestPlaces.value;
    t.format.eliminacion.type = elimType.value;
    t.format.restrictions.avoidSameProvince = avoidSameProvince.checked;
    t.format.restrictions.avoidSameClub = avoidSameClub.checked;
    t.format.restrictions.avoidFirstSlotStreak = avoidFirstSlot.checked;
    t.format.restrictions.avoidLastSlotStreak = avoidLastSlot.checked;
    upsertCurrentTournament();
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
    el &&
      el.addEventListener("change", () => {
        updateFormat();
        refreshFormatPanels();
      });
  });

  function refreshFormatPanels() {
    const type = formatSelect.value;
    document.getElementById("format-liga-options").style.display =
      type === "liga" ? "block" : "none";
    document.getElementById("format-zonas-options").style.display =
      type === "zonas" || type === "zonas-playoffs" ? "block" : "none";
    document.getElementById("format-elim-options").style.display =
      type === "eliminacion" || type === "zonas-playoffs" ? "block" : "none";
  }

  refreshFormatPanels();
}

// =====================
//  STEP 4: CANCHAS / CORTES / HORARIOS
// =====================

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
  btn &&
    btn.addEventListener("click", () => {
      const t = appState.currentTournament;
      if (!t) return;
      if (!t.teams.length) {
        alert("Primero cargá equipos.");
        return;
      }

      const scheduleOptions = {
        dateStart: t.dateStart,
        dateEnd: t.dateEnd,
        dayTimeMin: t.dayTimeMin,
        dayTimeMax: t.dayTimeMax,
        matchDurationMinutes: t.matchDurationMinutes,
        restMinMinutes: t.restMinMinutes,
        fields: t.fields,
        breaks: t.breaks,
        restrictions: t.format.restrictions,
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
        // importante: zonas primero, luego playoffs por orden de ronda
        matchesBase = baseZonas.concat(playoffs);
      } else if (t.format.type === "eliminacion") {
        const ids = t.teams.map((e) => e.id);
        matchesBase = generarLlavesEliminacion(ids, {
          type: t.format.eliminacion.type,
        });
      }

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
