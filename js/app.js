// app.js v0.2
// Generación de fixture (liga y zonas) + scheduler básico.

const appState = {
  currentTournament: null,
  tournaments: [],
};

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
  const idx = appState.tournaments.findIndex(t => t.id === id);
  if (idx === -1) appState.tournaments.push(appState.currentTournament);
  else appState.tournaments[idx] = appState.currentTournament;
  saveTournamentsToLocalStorage();
}

// ===== Utilidades de fecha/hora =====

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

// ===== Engine: round robin =====

function generarFixtureLiga(teamIds, options) {
  options = options || {};
  const idaVuelta = !!options.idaVuelta;
  const zone = options.zone || null;
  const phase = options.phase || "fase-liga";
  const equipos = teamIds.slice();
  if (equipos.length < 2) return [];

  let tieneBye = false;
  if (equipos.length % 2 === 1) {
    equipos.push(null);
    tieneBye = true;
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
          zone: zone,
          homeTeamId: home,
          awayTeamId: away,
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
    const vuelta = fixtures.map(m => ({
      id: safeId("m"),
      zone: m.zone,
      homeTeamId: m.awayTeamId,
      awayTeamId: m.homeTeamId,
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

function generarLlavesEliminacion(teamIds, options) {
  options = options || {};
  const type = options.type || "simple";
  const ids = teamIds.slice();
  if (ids.length < 2) return [];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const matches = [];
  for (let i = 0; i < n / 2; i++) {
    const home = ids[i];
    const away = ids[n - 1 - i];
    if (!home || !away) continue;
    matches.push({
      id: safeId("m"),
      zone: null,
      homeTeamId: home,
      awayTeamId: away,
      date: null,
      time: null,
      fieldId: null,
      round: 1,
      phase: type === "consolation" ? "playoff-consolation" : "playoff-main",
    });
  }
  return matches;
}

function asignarHorarios(matches, options) {
  if (!matches.length) return matches;
  const dateStartObj = dateStrToDate(options.dateStart);
  const dateEndObj = dateStrToDate(options.dateEnd);
  if (!dateStartObj || !dateEndObj || dateEndObj < dateStartObj) {
    console.warn("Rango de fechas inválido; partidos sin programar");
    return matches;
  }

  let fields = Array.isArray(options.fields) && options.fields.length
    ? options.fields.slice()
    : [{ id: safeId("field"), name: "Cancha 1", maxMatchesPerDay: null }];

  const minMin = parseTimeToMinutes(options.dayTimeMin || "09:00");
  const maxMin = parseTimeToMinutes(options.dayTimeMax || "22:00");
  const dur = options.matchDurationMinutes || 60;
  const rest = options.restMinMinutes || 0;

  if (minMin === null || maxMin === null || maxMin <= minMin) {
    console.warn("Horario diario inválido; partidos sin programar");
    return matches;
  }

  const cortes = Array.isArray(options.breaks)
    ? options.breaks
        .map(b => {
          const from = parseTimeToMinutes(b.from);
          const to = parseTimeToMinutes(b.to);
          if (from === null || to === null || to <= from) return null;
          return { from, to };
        })
        .filter(Boolean)
    : [];

  const slots = [];
  let dayIndex = 0;
  for (let d = new Date(dateStartObj.getTime()); d <= dateEndObj; d = addDays(d, 1), dayIndex++) {
    const dateStr = formatDate(d);
    const base = dayIndex * 24 * 60;
    for (let t = minMin; t + dur <= maxMin; t += dur) {
      const start = t;
      const end = t + dur;
      const inBreak = cortes.some(c => !(end <= c.from || start >= c.to));
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
  const scheduled = matches.map(m => {
    const home = m.homeTeamId;
    const away = m.awayTeamId;
    let chosen = -1;
    for (let i = 0; i < slots.length; i++) {
      if (used[i]) continue;
      const s = slots[i];
      const startAbs = s.absoluteStart;
      const endAbs = s.absoluteStart + dur;
      const lastH = lastEnd[home] ?? -Infinity;
      const lastA = lastEnd[away] ?? -Infinity;
      if (startAbs - lastH < rest) continue;
      if (startAbs - lastA < rest) continue;
      chosen = i;
      lastEnd[home] = endAbs;
      lastEnd[away] = endAbs;
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

// ===== Inicialización general =====

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
    stepPanels.forEach(panel => panel.classList.toggle("active", panel.id === "step-" + n));
  }
  stepItems.forEach(li => li.addEventListener("click", () => showStep(li.dataset.step)));
  document.querySelectorAll("[data-next-step]").forEach(btn =>
    btn.addEventListener("click", () => showStep(btn.dataset.nextStep))
  );
  document.querySelectorAll("[data-prev-step]").forEach(btn =>
    btn.addEventListener("click", () => showStep(btn.dataset.prevStep))
  );
  const btnNew = document.getElementById("btn-new-tournament");
  const btnList = document.getElementById("btn-tournament-list");
  btnNew && btnNew.addEventListener("click", () => {
    startNewTournament();
    showStep(1);
  });
  btnList && btnList.addEventListener("click", () => {
    const names = appState.tournaments.map(t => "• " + (t.name || "(sin nombre)") + " (" + t.id + ")").join("\n");
    alert(appState.tournaments.length
      ? "Torneos guardados en este navegador:\n\n" + names
      : "Todavía no hay torneos guardados en este navegador.");
  });
}

// ===== Step 1 =====

function initStep1() {
  ["t-name","t-category","t-date-start","t-date-end","t-storage-mode"].forEach(id => {
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

// ===== Step 2: equipos =====

function initTeamsSection() {
  const btnAddTeam = document.getElementById("btn-add-team");
  const btnImportCsv = document.getElementById("btn-import-csv");
  const fileInput = document.getElementById("teams-csv-input");

  btnAddTeam && btnAddTeam.addEventListener("click", () => {
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

  btnImportCsv && btnImportCsv.addEventListener("click", () => {
    fileInput && fileInput.click();
  });

  fileInput && fileInput.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
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
      "<td>" + (index + 1) + "</td>" +
      "<td>" + (team.zone || "-") + "</td>" +
      "<td>" + team.shortName + "</td>" +
      "<td>" + (team.longName || "") + "</td>" +
      "<td>" + (team.origin || "") + "</td>" +
      "<td>" + (team.category || "") + "</td>" +
      '<td><button class="btn ghost btn-sm" data-remove-team="' + team.id + '">✕</button></td>';
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-remove-team]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-team");
      const t = appState.currentTournament;
      if (!t) return;
      t.teams = t.teams.filter(tm => tm.id !== id);
      upsertCurrentTournament();
      renderTeamsTable();
    });
  });
}

function clearTeamInputs() {
  ["team-short","team-long","team-origin","team-category","team-zone"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

function importTeamsFromCsv(text) {
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
  alert("Equipos importados (stub CSV). Ajustaremos al formato real más adelante.");
}

// ===== Step 3: formato =====

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

  [formatSelect, ligaRounds, zonasQualifiers, zonasBestPlaces, elimType,
   avoidSameProvince, avoidSameClub, avoidFirstSlot, avoidLastSlot].forEach(el => {
    el && el.addEventListener("change", () => {
      updateFormat();
      refreshFormatPanels();
    });
  });

  function refreshFormatPanels() {
    const type = formatSelect.value;
    document.getElementById("format-liga-options").style.display =
      type === "liga" ? "block" : "none";
    document.getElementById("format-zonas-options").style.display =
      (type === "zonas" || type === "zonas-playoffs") ? "block" : "none";
    document.getElementById("format-elim-options").style.display =
      (type === "eliminacion" || type === "zonas-playoffs") ? "block" : "none";
  }

  refreshFormatPanels();
}

// ===== Step 4: canchas y cortes =====

function initFieldsSection() {
  const btnAddField = document.getElementById("btn-add-field");
  btnAddField && btnAddField.addEventListener("click", () => {
    const t = appState.currentTournament;
    if (!t) return;
    const name = document.getElementById("field-name").value.trim();
    const maxMatches = Number(document.getElementById("field-max-matches").value || 0);
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

  ["day-time-min","day-time-max","match-duration","rest-min"].forEach(id => {
    const el = document.getElementById(id);
    el && el.addEventListener("change", () => {
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
    tr.innerHTML =
      "<td>" + (index + 1) + "</td>" +
      "<td>" + field.name + "</td>" +
      "<td>" + (field.maxMatchesPerDay ?? "-") + "</td>" +
      '<td><button class="btn ghost btn-sm" data-remove-field="' + field.id + '">✕</button></td>';
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

function initBreaksSection() {
  const btnAddBreak = document.getElementById("btn-add-break");
  btnAddBreak && btnAddBreak.addEventListener("click", () => {
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
  ul.innerHTML = "";
  const t = appState.currentTournament;
  if (!t) return;
  t.breaks.forEach((b, idx) => {
    const li = document.createElement("li");
    li.textContent = "Corte " + (idx + 1) + ": " + b.from + "–" + b.to;
    ul.appendChild(li);
  });
}

// ===== Step 5: generar fixture =====

function initFixtureGeneration() {
  const btn = document.getElementById("btn-generate-fixture");
  btn && btn.addEventListener("click", () => {
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
        idaVuelta: t.format.liga.rounds === "ida-vuelta",
      });
      if (t.format.type === "zonas-playoffs") {
        // A futuro: calcular clasificados y generar playoffs
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
    container.textContent = "Todavía no hay partidos generados.";
    return;
  }

  // Map de id equipo -> objeto
  const teamById = {};
  t.teams.forEach(team => {
    teamById[team.id] = team;
  });

  const table = document.createElement("table");
  table.className = "fixture-table";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr>" +
    "<th>#</th>" +
    "<th>Zona</th>" +
    "<th>Fecha</th>" +
    "<th>Hora</th>" +
    "<th>Cancha (id)</th>" +
    "<th>Partido</th>" +
    "<th>Fase / Ronda</th>" +
    "</tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");

  t.matches.forEach((m, idx) => {
    const home = teamById[m.homeTeamId];
    const away = teamById[m.awayTeamId];
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + (idx + 1) + "</td>" +
      "<td>" + (m.zone || "-") + "</td>" +
      "<td>" + (m.date || "-") + "</td>" +
      "<td>" + (m.time || "-") + "</td>" +
      "<td>" + (m.fieldId || "-") + "</td>" +
      "<td>" +
        (home ? home.shortName : "?") +
        " vs " +
        (away ? away.shortName : "?") +
      "</td>" +
      "<td>" + (m.phase || "") + " (R" + (m.round || "-") + ")</td>";
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}
