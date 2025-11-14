// app.js
// Versión simplificada: todo el código JS en un solo archivo, sin imports/exports.

// =====================
//  ESTADO GLOBAL
// =====================

const appState = {
  currentTournament: null,
  tournaments: [],
};

function createEmptyTournament() {
  return {
    id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: "",
    category: "",
    dateStart: "",
    dateEnd: "",
    storageMode: "local",

    format: {
      type: "liga", // liga | zonas | zonas-playoffs | eliminacion
      liga: {
        rounds: "ida", // ida | ida-vuelta
      },
      zonas: {
        qualifiersPerZone: 2,
        bestPlacesMode: "none", // none | best-seconds | best-thirds | best-second-third
      },
      eliminacion: {
        type: "simple", // simple | third-place | consolation
      },
      restrictions: {
        avoidSameProvince: false,
        avoidSameClub: false,
        avoidFirstSlotStreak: true,
        avoidLastSlotStreak: true,
      },
    },

    teams: [], // { id, shortName, longName, origin, category, zone }
    fields: [], // { id, name, maxMatchesPerDay }
    breaks: [], // { from: "13:00", to: "14:00" }

    dayTimeMin: "09:00",
    dayTimeMax: "22:00",
    matchDurationMinutes: 60,
    restMinMinutes: 90,

    matches: [], // { id, zone, homeTeamId, awayTeamId, date, time, fieldId, round, phase }
  };
}

// =====================
//  STORAGE (LOCALSTORAGE)
// =====================

const LS_KEY = "fixture-planner-tournaments";

function loadTournamentsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      appState.tournaments = parsed;
    }
  } catch (err) {
    console.error("Error leyendo LocalStorage", err);
  }
}

function saveTournamentsToLocalStorage() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(appState.tournaments));
  } catch (err) {
    console.error("Error guardando LocalStorage", err);
  }
}

function upsertCurrentTournament() {
  if (!appState.currentTournament) return;
  const idx = appState.tournaments.findIndex(t => t.id === appState.currentTournament.id);
  if (idx === -1) {
    appState.tournaments.push(appState.currentTournament);
  } else {
    appState.tournaments[idx] = appState.currentTournament;
  }
  saveTournamentsToLocalStorage();
}

// =====================
//  STUBS DE ENGINE (FIXTURE & SCHEDULER)
// =====================

/**
 * Genera un fixture todos contra todos (método de círculo).
 * Por ahora es un stub que no genera partidos reales.
 */
function generarFixtureLiga(equipos, options = { idaVuelta: false }) {
  console.log("Generar fixture liga (stub)", { equipos, options });
  return [];
}

/**
 * Genera fixtures por zona a partir de un mapa zona -> equipos.
 * Stub por ahora.
 */
function generarFixtureZonas(zonesMap, options) {
  console.log("Generar fixture por zonas (stub)", { zonesMap, options });
  return [];
}

/**
 * Genera llaves de eliminación en base a una lista de clasificados.
 * Stub por ahora.
 */
function generarLlavesEliminacion(teams, options) {
  console.log("Generar llaves (stub)", { teams, options });
  return [];
}

/**
 * Asigna fechas/horarios/canchas a una lista de partidos vacíos.
 * Stub por ahora.
 */
function asignarHorarios(matches, options) {
  console.log("Asignar horarios (stub)", { matches, options });
  return matches;
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
});

// =====================
//  NAVEGACIÓN ENTRE PASOS
// =====================

function startNewTournament() {
  appState.currentTournament = createEmptyTournament();
  syncUIFromState_step1();
  renderTeamsTable();
  renderFieldsTable();
  renderBreaksList();
  renderFixtureResult();
}

function initNavigation() {
  const stepItems = document.querySelectorAll(".step-item");
  const stepPanels = document.querySelectorAll(".step-panel");

  function showStep(n) {
    stepItems.forEach(li => li.classList.toggle("active", li.dataset.step === String(n)));
    stepPanels.forEach(panel => panel.classList.toggle("active", panel.id === `step-${n}`));
  }

  stepItems.forEach(li => {
    li.addEventListener("click", () => showStep(li.dataset.step));
  });

  document.querySelectorAll("[data-next-step]").forEach(btn => {
    btn.addEventListener("click", () => showStep(btn.dataset.nextStep));
  });

  document.querySelectorAll("[data-prev-step]").forEach(btn => {
    btn.addEventListener("click", () => showStep(btn.dataset.prevStep));
  });

  const btnNew = document.getElementById("btn-new-tournament");
  const btnList = document.getElementById("btn-tournament-list");

  btnNew?.addEventListener("click", () => {
    startNewTournament();
    showStep(1);
  });

  btnList?.addEventListener("click", () => {
    const names = appState.tournaments.map(t => `• ${t.name || "(sin nombre)"} (${t.id})`).join("\n");
    alert(appState.tournaments.length
      ? `Torneos guardados en este navegador:\n\n${names}`
      : "Todavía no hay torneos guardados en este navegador.");
  });
}

// =====================
//  STEP 1: DATOS GENERALES
// =====================

function initStep1() {
  ["t-name", "t-category", "t-date-start", "t-date-end", "t-storage-mode"].forEach(id => {
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
  });
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
//  STEP 2: EQUIPOS Y ZONAS
// =====================

function initTeamsSection() {
  const btnAddTeam = document.getElementById("btn-add-team");
  const btnImportCsv = document.getElementById("btn-import-csv");
  const fileInput = document.getElementById("teams-csv-input");

  btnAddTeam?.addEventListener("click", () => {
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
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `team_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      shortName,
      longName: longName || shortName,
      origin,
      category,
      zone,
    });

    upsertCurrentTournament();
    renderTeamsTable();
    clearTeamInputs();
  });

  btnImportCsv?.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput?.addEventListener("change", e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target.result;
      importTeamsFromCsv(text);
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
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${team.zone || "-"}</td>
      <td>${team.shortName}</td>
      <td>${team.longName || ""}</td>
      <td>${team.origin || ""}</td>
      <td>${team.category || ""}</td>
      <td><button class="btn ghost btn-sm" data-remove-team="${team.id}">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-team]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-team");
      const t = appState.currentTournament;
      if (!t) return;
      t.teams = t.teams.filter(team => team.id !== id);
      upsertCurrentTournament();
      renderTeamsTable();
    });
  });
}

function clearTeamInputs() {
  ["team-short", "team-long", "team-origin", "team-category", "team-zone"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function importTeamsFromCsv(text) {
  // Stub muy simple.
  // TODO: adaptar al formato exacto de CSV que exporta tu sorteador.
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length <= 1) {
    alert("CSV vacío o sin encabezados.");
    return;
  }

  const header = lines[0].split(";").map(h => h.trim().toLowerCase());
  const zoneIdx = header.findIndex(h => h.includes("zona"));
  const teamIdx = header.findIndex(h => h.includes("equipo"));

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
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `team_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      shortName,
      longName: shortName,
      origin: "",
      category: "",
      zone,
    });
  }

  upsertCurrentTournament();
  renderTeamsTable();
  alert("Equipos importados (stub CSV). Ajustaremos al formato real más adelante.");
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

  function updateFormatInState() {
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
  ].forEach(el => {
    el?.addEventListener("change", () => {
      updateFormatInState();
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
//  STEP 4: CANCHAS Y CORTES
// =====================

function initFieldsSection() {
  const btnAddField = document.getElementById("btn-add-field");
  btnAddField?.addEventListener("click", () => {
    const t = appState.currentTournament;
    if (!t) return;

    const name = document.getElementById("field-name").value.trim();
    const maxMatches = Number(document.getElementById("field-max-matches").value || 0);
    if (!name) {
      alert("Ingresá un nombre de cancha.");
      return;
    }
    t.fields.push({
      id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : `field_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name,
      maxMatchesPerDay: maxMatches > 0 ? maxMatches : null,
    });
    upsertCurrentTournament();
    renderFieldsTable();
    document.getElementById("field-name").value = "";
    document.getElementById("field-max-matches").value = "";
  });

  ["day-time-min", "day-time-max", "match-duration", "rest-min"].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener("change", () => {
      const t = appState.currentTournament;
      if (!t) return;
      t.dayTimeMin = document.getElementById("day-time-min").value || "09:00";
      t.dayTimeMax = document.getElementById("day-time-max").value || "22:00";
      t.matchDurationMinutes = Number(document.getElementById("match-duration").value || 60);
      t.restMinMinutes = Number(document.getElementById("rest-min").value || 90);
      upsertCurrentTournament();
    });
  });

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
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${field.name}</td>
      <td>${field.maxMatchesPerDay ?? "-"}</td>
      <td><button class="btn ghost btn-sm" data-remove-field="${field.id}">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-remove-field]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-field");
      const t = appState.currentTournament;
      if (!t) return;
      t.fields = t.fields.filter(f => f.id !== id);
      upsertCurrentTournament();
      renderFieldsTable();
    });
  });
}

// Cortes

function initBreaksSection() {
  const btnAddBreak = document.getElementById("btn-add-break");
  btnAddBreak?.addEventListener("click", () => {
    const t = appState.currentTournament;
    if (!t) return;

    const from = document.getElementById("break-from").value;
    const to = document.getElementById("break-to").value;

    if (!from || !to) {
      alert("Definí un rango de horas para el corte.");
      return;
    }

    t.breaks.push({ from, to });
    upsertCurrentTournament();
    renderBreaksList();
  });

  renderBreaksList();
}

function renderBreaksList() {
  const ul = document.getElementById("breaks-list");
  if (!ul) return;
  ul.innerHTML = "";
  const t = appState.currentTournament;
  if (!t) return;

  t.breaks.forEach((b, index) => {
    const li = document.createElement("li");
    li.textContent = `Corte ${index + 1}: ${b.from}–${b.to}`;
    ul.appendChild(li);
  });
}

// =====================
//  STEP 5: GENERAR FIXTURE
// =====================

function initFixtureGeneration() {
  const btnGenerate = document.getElementById("btn-generate-fixture");
  btnGenerate?.addEventListener("click", () => {
    const t = appState.currentTournament;
    if (!t) return;

    if (!t.teams.length) {
      alert("Primero cargá equipos.");
      return;
    }

    let matches = [];

    if (t.format.type === "liga") {
      const ids = t.teams.map(e => e.id);
      matches = generarFixtureLiga(ids, {
        idaVuelta: t.format.liga.rounds === "ida-vuelta",
      });
    } else if (t.format.type === "zonas" || t.format.type === "zonas-playoffs") {
      const zonesMap = {};
      t.teams.forEach(team => {
        const key = team.zone || "Zona";
        if (!zonesMap[key]) zonesMap[key] = [];
        zonesMap[key].push(team.id);
      });
      matches = generarFixtureZonas(zonesMap, {
        qualifiersPerZone: t.format.zonas.qualifiersPerZone,
        bestPlacesMode: t.format.zonas.bestPlacesMode,
      });

      if (t.format.type === "zonas-playoffs") {
        // TODO: calcular clasificados y llamar generarLlavesEliminacion
      }
    } else if (t.format.type === "eliminacion") {
      const ids = t.teams.map(e => e.id);
      matches = generarLlavesEliminacion(ids, {
        type: t.format.eliminacion.type,
      });
    }

    matches = asignarHorarios(matches, {
      dateStart: t.dateStart,
      dateEnd: t.dateEnd,
      dayTimeMin: t.dayTimeMin,
      dayTimeMax: t.dayTimeMax,
      matchDurationMinutes: t.matchDurationMinutes,
      restMinMinutes: t.restMinMinutes,
      fields: t.fields,
      breaks: t.breaks,
      restrictions: t.format.restrictions,
    });

    t.matches = matches;
    upsertCurrentTournament();
    renderFixtureResult();
  });
}

function renderFixtureResult() {
  const container = document.getElementById("fixture-result");
  if (!container) return;
  const t = appState.currentTournament;
  if (!t) return;

  container.innerHTML = "";

  if (!t.matches || !t.matches.length) {
    container.textContent = "Todavía no hay partidos generados (algoritmo de fixture pendiente).";
    return;
  }

  const pre = document.createElement("pre");
  pre.style.fontSize = "0.8rem";
  pre.textContent = JSON.stringify(t.matches, null, 2);
  container.appendChild(pre);
}
