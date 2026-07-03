from __future__ import annotations

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
import csv
import re


# ------------------------------------------------------------
#  MODELOS
# ------------------------------------------------------------

@dataclass
class Team:
    name: str
    zone: Optional[str] = None


@dataclass
class Match:
    home: str
    away: str
    day: Optional[int] = None
    time: Optional[str] = None
    field: Optional[str] = None
    zone: Optional[str] = None
    round: Optional[int] = None

def _fix_regular_rounds(matches: List[Dict[str, Any]]) -> None:
    """
    Arregla 'round' SOLO para fase regular 8x3 / 8x3_sembrado.
    Regla: si zone es una letra A..H, se numera 1..N por orden de 'number'.
    """
    def is_regular_zone(z: str) -> bool:
        return bool(re.fullmatch(r"[A-H]", (z or "").strip()))

    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for m in matches:
        z = (m.get("zone") or "").strip()
        if not is_regular_zone(z):
            continue
        buckets.setdefault(z, []).append(m)

    def num_key(mm: Dict[str, Any]) -> int:
        n = mm.get("number")
        try:
            return int(n)
        except Exception:
            return 10**9

    for z, arr in buckets.items():
        arr_sorted = sorted(arr, key=num_key)
        for idx, mm in enumerate(arr_sorted, start=1):
            mm["round"] = idx

# ------------------------------------------------------------
#  CSV
# ------------------------------------------------------------

def read_teams_from_csv(filepath: str) -> List[Team]:
    teams: List[Team] = []
    with open(filepath, newline='', encoding='utf-8') as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
                    if not row:
                        continue

                    # Soportar CSV con encabezado (Equipo, Zona)
                    c0 = (row[0] or "").strip()
                    c1 = (row[1] or "").strip() if len(row) > 1 else ""

                    # Si parece encabezado típico, lo salteamos
                    if c0.lower() in ("equipo", "equipos", "team", "teams", "nombre", "name") and c1.lower() in ("zona", "zonas", "zone", "group"):
                        continue

                    name = c0
                    zone = c1 or None

                    if name:
                        teams.append(Team(name=name, zone=zone))

    return teams


# ------------------------------------------------------------
#  ZONAS
# ------------------------------------------------------------

def assign_zones(teams: List[Team], system: str) -> List[Team]:
    """Asigna zonas a los equipos según el sistema.

    - '8x3' y '8x3_sembrado' soportan 24, 23 y 22 equipos:
        24 => 8 zonas de 3
        23 => 7 zonas de 3 + 1 zona de 2
        22 => 6 zonas de 3 + 2 zonas de 2
    - '4x6' soporta 24 equipos (4 zonas de 6)
    - 'rr' => todos en zona 'A'
    """
    # Si todos tienen zona asignada en el CSV, no modificamos
    if all(team.zone for team in teams):
        return teams

    n = len(teams)
    system = (system or "").lower().strip()

    if system in ("8x3", "8x3_sembrado"):
        if n not in (21, 22, 23, 24):
            # Si quieren usar 8x3 con otra cantidad, elegimos rr para no romper
            for t in teams:
                t.zone = "A"
            return teams

        # tamaños por zona según cantidad
        if n == 21:
            # 7 zonas A..G (todas de 3)
            zone_names = [chr(ord("A") + i) for i in range(7)]
            sizes = [3] * 7
        else:
            # 8 zonas A..H
            zone_names = [chr(ord("A") + i) for i in range(8)]
            if n == 24:
                sizes = [3] * 8
            elif n == 23:
                sizes = [3] * 7 + [2]
            else:  # n == 22
                sizes = [3] * 6 + [2, 2]

        idx = 0
        for z, size in zip(zone_names, sizes):
            for _ in range(size):
                teams[idx].zone = z
                idx += 1
        return teams

    if system == "4x6":
        if n != 24:
            for t in teams:
                t.zone = "A"
            return teams
        zone_names = ["A", "B", "C", "D"]
        idx = 0
        for z in zone_names:
            for _ in range(6):
                teams[idx].zone = z
                idx += 1
        return teams

    # rr: todos en una zona
    for t in teams:
        t.zone = "A"
    return teams


# ------------------------------------------------------------
#  HORARIOS (TIMESLOTS)
# ------------------------------------------------------------

def _parse_time(t: str) -> int:
    h, m = t.split(':')
    return int(h) * 60 + int(m)


def _format_time(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f'{h:02d}:{m:02d}'


def generate_timeslots_list(
    days: int,
    fields: int,
    start_time: str,
    end_time: str,
    match_duration: int,
    midday_break: Optional[Tuple[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Genera una lista de slots:
      {
        "index": nro,
        "day":   día (1..days),
        "time":  "HH:MM",
        "field": "C1", "C2", ...
      }
    Compatible con tu script.js (renderSchedule).
    """
    start_min = _parse_time(start_time)
    end_min = _parse_time(end_time)
    if end_min <= start_min:
        raise ValueError('La hora de fin debe ser posterior a la de inicio.')

    mb_start = mb_end = None
    if midday_break is not None:
        mb_start = _parse_time(midday_break[0])
        mb_end = _parse_time(midday_break[1])
        if mb_end <= mb_start:
            mb_start = mb_end = None

    slots: List[Dict[str, Any]] = []
    index = 1

    for day in range(1, days + 1):
        t = start_min
        while t + match_duration <= end_min:
            # Saltar franja de mediodía si se solapa
            if mb_start is not None:
                if not (t + match_duration <= mb_start or t >= mb_end):
                    t = mb_end
                    continue
            time_str = _format_time(t)
            for f in range(1, fields + 1):
                slots.append({
                    'index': index,
                    'day': day,
                    'time': time_str,
                    'field': f'C{f}',
                })
                index += 1
            t += match_duration

    return slots


# ------------------------------------------------------------
#  PARTIDOS (FASE REGULAR GENÉRICA)
# ------------------------------------------------------------

def generate_match_list(
    teams: List[Team],
    system: str,
    home_and_away: bool = False,
) -> List[Dict[str, Any]]:
    """
    Devuelve sólo la fase regular:
    - Zonas de 2 equipos → ida y vuelta siempre.
    - Zonas de 3+ equipos → todos contra todos (y vuelta si home_and_away=True).
    """
    from collections import defaultdict

    teams = assign_zones(list(teams), system)

    zones: Dict[str, List[Team]] = defaultdict(list)
    for t in teams:
        zones[t.zone].append(t)

    matches: List[Dict[str, Any]] = []

    for zone_name, zone_teams in zones.items():
        n = len(zone_teams)
        if n < 2:
            continue

        # Zonas de 2 equipos: ida y vuelta sí o sí
        if n == 2:
            t1, t2 = zone_teams
            matches.append({
                'zone': zone_name,
                'home': t1.name,
                'away': t2.name,
                'round': 1,
            })
            matches.append({
                'zone': zone_name,
                'home': t2.name,
                'away': t1.name,
                'round': 2,
            })
            continue

        # Zonas de 3 o más: todos contra todos
        round_counter = 1
        for i in range(n):
            for j in range(i + 1, n):
                matches.append({
                    'zone': zone_name,
                    'home': zone_teams[i].name,
                    'away': zone_teams[j].name,
                    'round': round_counter,
                })
                round_counter += 1
                if home_and_away:
                    matches.append({
                        'zone': zone_name,
                        'home': zone_teams[j].name,
                        'away': zone_teams[i].name,
                        'round': round_counter,
                    })
                    round_counter += 1

    return matches


# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 24 EQUIPOS (PDF QUE ME MANDASTE)
# ------------------------------------------------------------

def generate_24_team_full_tournament(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 24 equipos (8 zonas de 3) + fase final, según el PDF.

    Devuelve 64 partidos con:
      number, day, field, zone, home, away, round

    El frontend sólo usa home, away, zone, round.
    """
    if len(teams) != 24:
        raise ValueError('Este fixture está definido sólo para 24 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # --- Fase regular (1–24) ---
    regular_specs = [
        (1, 1, 'C1', 'A', 1, 2), (2, 1, 'C2', 'C', 7, 8),
        (3, 1, 'C1', 'B', 4, 5), (4, 1, 'C2', 'D', 10, 11),
        (5, 1, 'C1', 'E', 13, 14), (6, 1, 'C2', 'G', 19, 20),
        (7, 1, 'C1', 'F', 16, 17), (8, 1, 'C2', 'H', 22, 23),
        (9, 1, 'C1', 'A', 2, 3), (10, 1, 'C2', 'C', 8, 9),
        (11, 1, 'C1', 'B', 5, 6), (12, 1, 'C2', 'D', 11, 12),
        (13, 2, 'C1', 'E', 14, 15), (14, 2, 'C2', 'G', 20, 21),
        (15, 2, 'C1', 'F', 17, 18), (16, 2, 'C2', 'H', 23, 24),
        (17, 2, 'C1', 'A', 3, 1), (18, 2, 'C2', 'C', 9, 7),
        (19, 2, 'C1', 'B', 6, 4), (20, 2, 'C2', 'D', 12, 10),
        (21, 2, 'C1', 'E', 15, 13), (22, 2, 'C2', 'G', 21, 19),
        (23, 2, 'C1', 'F', 18, 16), (24, 2, 'C2', 'H', 24, 22),
    ]

    for n, day, field, zone, a, b in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(a),
            'away': seed_name(b),
            'round': 1,
        })

    # --- Fase final (25–64) ---
    elim_specs = [
        (25, 3, 'C1', 'ZA1',       '1°Z1',  '1°Z3'),
        (26, 3, 'C2', 'ZA1',       '1°Z5',  '1°Z7'),
        (27, 3, 'C1', 'ZA2',       '1°Z2',  '1°Z4'),
        (28, 3, 'C2', 'ZA2',       '1°Z6',  '1°Z8'),

        (29, 3, 'C1', 'LLAVE C',   '3°Z1',  '3°Z3'),
        (30, 3, 'C2', 'LLAVE C',   '3°Z5',  '3°Z7'),
        (31, 3, 'C1', 'LLAVE C',   '3°Z2',  '3°Z4'),
        (32, 3, 'C2', 'LLAVE C',   '3°Z6',  '3°Z8'),

        (33, 3, 'C1', 'LLAVE B',   '2°Z1',  '2°Z3'),
        (34, 3, 'C2', 'LLAVE B',   '2°Z5',  '2°Z7'),
        (35, 3, 'C1', 'LLAVE B',   '2°Z2',  '2°Z4'),
        (36, 3, 'C2', 'LLAVE B',   '2°Z6',  '2°Z8'),

        (37, 3, 'C1', 'ZA1',       '1°Z3',  '1°Z5'),
        (38, 3, 'C2', 'ZA1',       '1°Z7',  '1°Z1'),
        (39, 3, 'C1', 'ZA2',       '1°Z4',  '1°Z6'),
        (40, 3, 'C2', 'ZA2',       '1°Z8',  '1°Z2'),

        (41, 4, 'C1', 'LLAVE C',   'PP29',  'PP30'),
        (42, 4, 'C2', 'LLAVE C',   'PP31',  'PP32'),
        (43, 4, 'C1', 'LLAVE C',   'GP29',  'GP30'),
        (44, 4, 'C2', 'LLAVE C',   'GP31',  'GP32'),

        (45, 4, 'C1', 'LLAVE B',   'PP33',  'PP34'),
        (46, 4, 'C2', 'LLAVE B',   'PP35',  'PP36'),
        (47, 4, 'C1', 'LLAVE B',   'GP33',  'GP34'),
        (48, 4, 'C2', 'LLAVE B',   'GP35',  'GP36'),

        (49, 4, 'C1', 'ZA1',       '1°Z1',  '1°Z5'),
        (50, 4, 'C2', 'ZA1',       '1°Z7',  '1°Z3'),
        (51, 4, 'C1', 'ZA2',       '1°Z2',  '1°Z6'),
        (52, 4, 'C2', 'ZA2',       '1°Z8',  '1°Z4'),

        (53, 4, 'C1', '23º - 24º', 'PP41',  'PP42'),
        (54, 4, 'C2', '21º - 22º', 'GP41',  'GP42'),
        (55, 4, 'C1', '19º - 20º', 'PP43',  'PP44'),
        (56, 4, 'C2', '17º - 18º', 'GP43',  'GP44'),

        (57, 5, 'C1', '15º - 16º', 'PP45',  'PP46'),
        (58, 5, 'C2', '13º - 14º', 'GP45',  'GP46'),
        (59, 5, 'C1', '11º - 12º', 'PP47',  'PP48'),
        (60, 5, 'C2', '9º - 10º',  'GP47',  'GP48'),

        (61, 5, 'C1', '7º - 8º',   '4°ZA1', '4°ZA2'),
        (62, 5, 'C2', '5º - 6º',   '3°ZA1', '3°ZA2'),
        (63, 5, 'C1', '3º - 4º',   '2°ZA1', '2°ZA2'),
        (64, 5, 'C2', '1º - 2º',   '1°ZA1', '1°ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 40:
            return 2
        if n <= 48:
            return 3
        if n <= 56:
            return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            # ✅ BYE / partido sin rival real (incluye el Nº53 en 23 equipos sembrado)
            '_is_bye': (str(h).strip().upper() == 'BYE'
                        or str(a).strip().upper() == 'BYE'
                        or (n == 53 and str(zone).strip() == '23º')),
        })
    _fix_regular_rounds(matches)
    return matches
def generate_24_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO 4x6 para 24 equipos, según 4X6_muestra_gpt_24_EQ.pdf

    Zonas y equipos (por número):
      Zona 1: 1..6
      Zona 2: 7..12
      Zona 3: 13..18
      Zona 4: 19..24

    Regular: 1..60 (Día 1..3, Ronda 1..5)
    Final:   61..84 (Día 4..5)

    Nota:
      - 'field' se devuelve vacío para que el Auto-ubicar use canchas disponibles.
      - 'zone' es "1","2","3","4" para fase regular (así el frontend la trata como regular).
      - En fase final, 'zone' son textos (LLAVE A..F, y "1º - 2º", etc.)
    """
    if len(teams) != 24:
        raise ValueError("Este fixture está definido sólo para 24 equipos (4x6).")

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f"Equipo {seed}"

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–60) — EXACTO del PDF
    # (nro, día, zona, equipoL, equipoV, ronda)
    # -------------------------
    regular_specs = [
        # Ronda 1 (Día 1)
        (1,  1, "1",  1,  2, 1),
        (2,  1, "1",  6,  3, 1),
        (3,  1, "1",  5,  4, 1),
        (4,  1, "2",  7,  8, 1),
        (5,  1, "2", 12,  9, 1),
        (6,  1, "2", 11, 10, 1),
        (7,  1, "3", 13, 14, 1),
        (8,  1, "3", 18, 15, 1),
        (9,  1, "3", 17, 16, 1),
        (10, 1, "4", 19, 20, 1),
        (11, 1, "4", 24, 21, 1),
        (12, 1, "4", 23, 22, 1),

        # Ronda 2 (Día 1)
        (13, 1, "1",  1,  6, 2),
        (14, 1, "1",  5,  2, 2),
        (15, 1, "1",  4,  3, 2),
        (16, 1, "2",  7, 12, 2),
        (17, 1, "2", 11,  8, 2),
        (18, 1, "2", 10,  9, 2),
        (19, 1, "3", 13, 18, 2),
        (20, 1, "3", 17, 14, 2),
        (21, 1, "3", 16, 15, 2),
        (22, 1, "4", 19, 24, 2),
        (23, 1, "4", 23, 20, 2),
        (24, 1, "4", 22, 21, 2),

        # Ronda 3 (Día 2)
        (25, 2, "1",  1,  5, 3),
        (26, 2, "1",  4,  6, 3),
        (27, 2, "1",  3,  2, 3),
        (28, 2, "2",  7, 11, 3),
        (29, 2, "2", 10, 12, 3),
        (30, 2, "2",  9,  8, 3),
        (31, 2, "3", 13, 17, 3),
        (32, 2, "3", 16, 18, 3),
        (33, 2, "3", 15, 14, 3),
        (34, 2, "4", 19, 23, 3),
        (35, 2, "4", 22, 24, 3),
        (36, 2, "4", 21, 20, 3),

        # Ronda 4 (Día 2)
        (37, 2, "1",  1,  4, 4),
        (38, 2, "1",  3,  5, 4),
        (39, 2, "1",  2,  6, 4),
        (40, 2, "2",  7, 10, 4),
        (41, 2, "2",  9, 11, 4),
        (42, 2, "2",  8, 12, 4),
        (43, 2, "3", 13, 16, 4),
        (44, 2, "3", 15, 17, 4),
        (45, 2, "3", 14, 18, 4),
        (46, 2, "4", 19, 22, 4),
        (47, 2, "4", 21, 23, 4),
        (48, 2, "4", 20, 24, 4),

        # Ronda 5 (Día 3)
        (49, 3, "1",  1,  3, 5),
        (50, 3, "1",  2,  4, 5),
        (51, 3, "1",  6,  5, 5),
        (52, 3, "2",  7,  9, 5),
        (53, 3, "2",  8, 10, 5),
        (54, 3, "2", 12, 11, 5),
        (55, 3, "3", 13, 15, 5),
        (56, 3, "3", 14, 16, 5),
        (57, 3, "3", 18, 17, 5),
        (58, 3, "4", 19, 21, 5),
        (59, 3, "4", 20, 22, 5),
        (60, 3, "4", 24, 23, 5),
    ]

    for n, day, zone, hs, as_, rnd in regular_specs:
        matches.append({
            "number": n,
            "day": day,
            "field": "",
            "zone": zone,
            "home": seed_name(hs),
            "away": seed_name(as_),
            "round": rnd,
            "_is_bye": False
        })

    # -------------------------
    # FASE FINAL (61–84) — EXACTO del PDF
    # (nro, día, zona, equipoL, equipoV, ronda)
    # -------------------------
    final_specs = [
        (61, 4, "LLAVE F", "6to. Z1", "6to. Z3", 1),
        (62, 4, "LLAVE F", "6to. Z2", "6to. Z4", 1),
        (63, 4, "LLAVE E", "5to. Z1", "5to. Z3", 1),
        (64, 4, "LLAVE E", "5to. Z2", "5to. Z4", 1),
        (65, 4, "LLAVE D", "4to. Z1", "4to. Z3", 1),
        (66, 4, "LLAVE D", "4to. Z2", "4to. Z4", 1),
        (67, 4, "LLAVE C", "3ro. Z1", "3ro. Z3", 1),
        (68, 4, "LLAVE C", "3ro. Z2", "3ro. Z4", 1),
        (69, 4, "LLAVE B", "2do. Z1", "2do. Z3", 1),
        (70, 4, "LLAVE B", "2do. Z2", "2do. Z4", 1),
        (71, 4, "LLAVE A", "1ro. Z1", "1ro. Z3", 1),
        (72, 4, "LLAVE A", "1ro. Z2", "1ro. Z4", 1),

        (73, 5, "23º - 24º", "PP61", "PP62", 2),
        (74, 5, "21º - 22º", "GP61", "GP62", 2),
        (75, 5, "19º - 20º", "PP63", "PP64", 2),
        (76, 5, "17º - 18º", "GP63", "GP64", 2),
        (77, 5, "15º - 16º", "PP65", "PP66", 2),
        (78, 5, "13º - 14º", "GP65", "GP66", 2),
        (79, 5, "11º - 12º", "PP67", "PP68", 2),
        (80, 5, "9º - 10º",  "GP67", "GP68", 2),
        (81, 5, "7º - 8º",   "PP69", "PP70", 2),
        (82, 5, "5º - 6º",   "GP69", "GP70", 2),
        (83, 5, "3º - 4º",   "PP71", "PP72", 2),
        (84, 5, "1º - 2º",   "GP71", "GP72", 2),
    ]

    for n, day, zone, home, away, rnd in final_specs:
        matches.append({
            "number": n,
            "day": day,
            "field": "",
            "zone": zone,
            "home": home,
            "away": away,
            "round": rnd,
            "_is_bye": False
        })

    return matches

def generate_24_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Variante '8x3 Sembrado' para 24 equipos.

    Es exactamente el mismo fixture que generate_24_team_full_tournament(...)
    (mismos números, días, canchas, zonas y llaves),
    pero cambia los placeholders de INICIO de la fase final para que coincidan con el PDF:
      - ZA1/ZA2: 1er./2do./... entre los 1º (sembrado por posiciones)
      - LLAVE B: 1er./2do./... entre los 2º
      - LLAVE C: 1er./2do./... entre los 3º

    Importante: esta función NO calcula los ganadores; sólo define los nombres placeholder.
    """
    matches = generate_24_team_full_tournament(teams)

    seeded_placeholders = {
        # Día 3 — ZA1/ZA2 (1º puestos)
        25: ("1er. 1º", "4to. 1º"),
        26: ("2do. 1º", "3er. 1º"),
        27: ("5to. 1º", "8vo. 1º"),
        28: ("6to. 1º", "7mo. 1º"),

        # Día 3 — LLAVE C (3º puestos)
        29: ("1er. 3º", "8vo. 3º"),
        30: ("4to. 3º", "5to. 3º"),
        31: ("3er. 3º", "6to. 3º"),
        32: ("2do. 3º", "7mo. 3º"),

        # Día 3 — LLAVE B (2º puestos)
        33: ("1er. 2º", "8vo. 2º"),
        34: ("4to. 2º", "5to. 2º"),
        35: ("3er. 2º", "6to. 2º"),
        36: ("2do. 2º", "7mo. 2º"),

        # Día 3 — ZA1/ZA2 (continuación sembrada)
        37: ("1er. 1º", "5to. 1º"),
        38: ("2do. 1º", "6to. 1º"),
        39: ("8vo. 1º", "4to. 1º"),
        40: ("7mo. 1º", "3er. 1º"),

        # Día 4 — ZA1/ZA2 (continuación sembrada)
        49: ("1er. 1º", "8vo. 1º"),
        50: ("2do. 1º", "7mo. 1º"),
        51: ("4to. 1º", "5to. 1º"),
        52: ("3er. 1º", "6to. 1º"),
    }

    for m in matches:
        num = m.get("number")
        if num in seeded_placeholders:
            h, a = seeded_placeholders[num]
            m["home"] = h
            m["away"] = a

    return matches
# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 20 EQUIPOS (8x3 Sembrado)
#  6 zonas de 3 (A-F) + 1 zona de 2 (G con ida/vuelta)
#  Fase final según cronograma de 20 equipos sembrado que pasaste
# ------------------------------------------------------------

def generate_20_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 20 equipos en sistema 8x3 Sembrado:
    - Fase regular: 6 zonas de 3 (A-F) + 1 zona de 2 (G con ida/vuelta)
    - Fase final: según tu cronograma (números/días/canchas/llaves)
    """
    if len(teams) != 20:
        raise ValueError('Este fixture está definido sólo para 20 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24)
    # -------------------------
    # Nota: en 20 equipos, la zona G tiene 2 equipos (19 y 20) → ida/vuelta (2 partidos)
    regular_specs = [
        (1,  1, 'C1', 'A',  1,  2),
        (2,  1, 'C2', 'C',  7,  8),
        (3,  1, 'C1', 'B',  4,  5),
        (4,  1, 'C2', 'D', 10, 11),
        (5,  1, 'C1', 'E', 13, 14),
        (6,  1, 'C2', 'G', 19, 20),
        (7,  1, 'C1', 'F', 16, 17),

        (9,  1, 'C1', 'A',  2,  3),
        (10, 1, 'C2', 'C',  8,  9),
        (11, 1, 'C1', 'B',  5,  6),
        (12, 1, 'C2', 'D', 11, 12),

        (13, 2, 'C1', 'E', 14, 15),
        (15, 2, 'C1', 'F', 17, 18),

        (17, 2, 'C1', 'A',  3,  1),
        (18, 2, 'C2', 'C',  9,  7),
        (19, 2, 'C1', 'B',  6,  4),
        (20, 2, 'C2', 'D', 12, 10),
        (21, 2, 'C1', 'E', 15, 13),
        (22, 2, 'C2', 'G', 20, 19),
        (23, 2, 'C1', 'F', 18, 16),
    ]

    def rr_round_for_zone_match(zone: str, number: int) -> int:
        # Zona G (2 equipos): ida/vuelta
        if zone == 'G':
            return 1 if number == 6 else 2
        # Zonas A-F: 3 rondas
        if number <= 7:
            return 1
        if number <= 15:
            return 2
        return 3

    for n, day, field, zone, h, a in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h),
            'away': seed_name(a),
            'round': rr_round_for_zone_match(zone, n),
        })

    # -------------------------
    # FASE FINAL (25–64)
    # -------------------------
    elim_specs = [
        (25, 3, 'C1', 'ZA1', '1er. 1º', '4to. 1º'),
        (26, 3, 'C2', 'ZA1', '5to. 1º', '1er. 2º'),
        (27, 3, 'C1', 'ZA2', '2do. 1º', '3er. 1º'),
        (28, 3, 'C2', 'ZA2', '6to. 1º', '7mo. 1º'),

        (29, 3, 'C1', 'LLAVE C', '3er. 3º', '6to. 3º'),
        (30, 3, 'C1', 'LLAVE C', '4to. 3º', '5to. 3º'),
        # (31) vacío
        # (32) vacío

        (33, 3, 'C1', 'LLAVE B', '2do. 2º', '2do. 3º'),
        (34, 3, 'C2', 'LLAVE B', '5to. 2º', '6to. 2º'),
        (35, 3, 'C1', 'LLAVE B', '4to. 2º', '7mo. 2º'),
        (36, 3, 'C2', 'LLAVE B', '1er. 3º', '3er. 2º'),

        (37, 3, 'C1', 'ZA1', '5to. 1º', '1er. 1º'),
        (38, 3, 'C2', 'ZA1', '1er. 2º', '4to. 1º'),
        (39, 3, 'C1', 'ZA2', '6to. 1º', '2do. 1º'),
        (40, 3, 'C2', 'ZA2', '7mo. 1º', '3er. 1º'),

        # LLAVE C (día 4) — según tu tabla de 20 equipos
        (41, 4, 'C1', 'LLAVE C', 'PP29', 'PP30'),
        # (42) vacío
        (43, 4, 'C1', 'LLAVE C', 'GP29', 'GP30'),
        # (44) vacío

        (45, 4, 'C1', 'LLAVE B', 'PP33', 'PP34'),
        (46, 4, 'C2', 'LLAVE B', 'PP35', 'PP36'),
        (47, 4, 'C1', 'LLAVE B', 'GP33', 'GP34'),
        (48, 4, 'C2', 'LLAVE B', 'GP35', 'GP36'),

        (49, 4, 'C1', 'ZA1', '1er. 2º', '1er. 1º'),
        (50, 4, 'C2', 'ZA1', '4to. 1º', '5to. 1º'),
        (51, 4, 'C1', 'ZA2', '7mo. 1º', '2do. 1º'),
        (52, 4, 'C2', 'ZA2', '3er. 1º', '6to. 1º'),

        # (53) vacío
        # (54) vacío

        (55, 4, 'C1', '19º - 20º', 'PP43', 'PP44'),
        (56, 4, 'C2', '17º - 18º', 'GP43', 'GP44'),

        # OJO: en tu tabla de 20 equipos, 57 y 58 son día 4 (no día 5)
        (57, 4, 'C1', '15º - 16º', 'PP45', 'PP46'),
        (58, 4, 'C2', '13º - 14º', 'GP45', 'GP46'),

        (59, 5, 'C1', '11º - 12º', 'PP47', 'PP48'),
        (60, 5, 'C2', '9º - 10º',  'GP47', 'GP48'),

        (61, 5, 'C1', '7º - 8º', '4°ZA1', '4°ZA2'),
        (62, 5, 'C2', '5º - 6º', '3°ZA1', '3°ZA2'),
        (63, 5, 'C1', '3º - 4º', '2°ZA1', '2°ZA2'),
        (64, 5, 'C2', '1º - 2º', '1°ZA1', '1°ZA2'),
    ]


    def round_for_number(n: int) -> int:
        # Misma lógica de “ronda por rango” que ya estás usando en 23 sembrado :contentReference[oaicite:1]{index=1}
        if n <= 24:
            return 1
        if n <= 41:
            return 2
        if n <= 52:
            return 3
        if n <= 56:
            return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        zz = str(zone).strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            # En 20 equipos, sólo es BYE si literalmente alguna punta dice "BYE"
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE'),
        })

    return matches

# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 21 EQUIPOS (8x3 Sembrado = 7x3)
#  7 zonas de 3 (A-G) + fase final según cronograma que pasaste
# ------------------------------------------------------------

def generate_21_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 21 equipos en sistema '8x3 Sembrado' (en realidad 7x3):
    - Fase regular: 7 zonas de 3 (A..G), 21 partidos (con rondas 1/2/3 por zona).
    - Fase final: partidos 25..64 con BYE e “informativo” 21º … PP30 (partido 41).
    """
    if len(teams) != 21:
        raise ValueError('Este fixture está definido sólo para 21 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # --- Fase regular (1–23, sin 8/16/24 porque no existen en 21 equipos) ---
    # Cada zona (A..G) tiene 3 rondas:
    #   R1: (1vs2), R2: (2vs3), R3: (3vs1) según tu cronograma.
    regular_specs = [
        # Día 1
        (1,  1, 'C1', 'A',  1,  2, 1),
        (2,  1, 'C2', 'C',  7,  8, 1),
        (3,  1, 'C1', 'B',  4,  5, 1),
        (4,  1, 'C2', 'D', 10, 11, 1),
        (5,  1, 'C1', 'E', 13, 14, 1),
        (6,  1, 'C2', 'G', 19, 20, 1),
        (7,  1, 'C1', 'F', 16, 17, 1),

        (9,  1, 'C1', 'A',  2,  3, 2),
        (10, 1, 'C2', 'C',  8,  9, 2),
        (11, 1, 'C1', 'B',  5,  6, 2),
        (12, 1, 'C2', 'D', 11, 12, 2),

        # Día 2
        (13, 2, 'C1', 'E', 14, 15, 2),
        (14, 2, 'C2', 'G', 20, 21, 2),
        (15, 2, 'C1', 'F', 17, 18, 2),

        (17, 2, 'C1', 'A',  3,  1, 3),
        (18, 2, 'C2', 'C',  9,  7, 3),
        (19, 2, 'C1', 'B',  6,  4, 3),
        (20, 2, 'C2', 'D', 12, 10, 3),
        (21, 2, 'C1', 'E', 15, 13, 3),
        (22, 2, 'C2', 'G', 21, 19, 3),
        (23, 2, 'C1', 'F', 18, 16, 3),
    ]

    for n, day, field, zone, hs, as_, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(hs),
            'away': seed_name(as_),
            'round': rnd,
            '_is_bye': False,
        })

    # --- Fase final (25–64, sin 53/54 porque están vacíos en tu tabla) ---
    elim_specs = [
        (25, 3, 'C1', 'ZA1',     '1er. 1º',  '4to. 1º'),
        (26, 3, 'C2', 'ZA1',     '5to. 1º',  '1er. 2º'),
        (27, 3, 'C1', 'ZA2',     '2do. 1º',  '3er. 1º'),
        (28, 3, 'C2', 'ZA2',     '6to. 1º',  '7mo. 1º'),

        (29, 3, 'C1', 'LLAVE C', '3er. 3º',  'BYE'),
        (30, 3, 'C2', 'LLAVE C', '6to. 3º',  '7mo. 3º'),
        (31, 3, 'C1', 'LLAVE C', '4to. 3º',  'BYE'),
        (32, 3, 'C2', 'LLAVE C', 'BYE',      '5to. 3º'),

        (33, 3, 'C1', 'LLAVE B', '2do. 2º',  '2do. 3º'),
        (34, 3, 'C2', 'LLAVE B', '5to. 2º',  '6to. 2º'),
        (35, 3, 'C1', 'LLAVE B', '4to. 2º',  '7mo. 2º'),
        (36, 3, 'C2', 'LLAVE B', '1er. 3º',  '3er. 2º'),

        (37, 3, 'C1', 'ZA1',     '5to. 1º',  '1er. 1º'),
        (38, 3, 'C2', 'ZA1',     '1er. 2º',  '4to. 1º'),
        (39, 3, 'C1', 'ZA2',     '6to. 1º',  '2do. 1º'),
        (40, 3, 'C2', 'ZA2',     '7mo. 1º',  '3er. 1º'),

        # Partido informativo (NO debe tener hora/cancha)
        (41, 3, '',   '21º',     '',         'PP30'),

        (42, 4, 'C2', 'LLAVE C', 'PP31',     'PP32'),
        (43, 4, 'C1', 'LLAVE C', '3er. 3º',  'GP30'),
        (44, 4, 'C2', 'LLAVE C', '4to. 3º',  '5to. 3º'),

        (45, 4, 'C1', 'LLAVE B', 'PP33',     'PP34'),
        (46, 4, 'C2', 'LLAVE B', 'PP35',     'PP36'),
        (47, 4, 'C1', 'LLAVE B', 'GP33',     'GP34'),
        (48, 4, 'C2', 'LLAVE B', 'GP35',     'GP36'),

        (49, 4, 'C1', 'ZA1',     '1er. 2º',  '1er. 1º'),
        (50, 4, 'C2', 'ZA1',     '4to. 1º',  '5to. 1º'),
        (51, 4, 'C1', 'ZA2',     '7mo. 1º',  '2do. 1º'),
        (52, 4, 'C2', 'ZA2',     '3er. 1º',  '6to. 1º'),

        (55, 4, 'C1', '19º - 20º', 'PP43',  'PP44'),
        (56, 4, 'C2', '17º - 18º', 'GP43',  'GP44'),

        (57, 5, 'C1', '15º - 16º', 'PP45',  'PP46'),
        (58, 5, 'C2', '13º - 14º', 'GP45',  'GP46'),
        (59, 5, 'C1', '11º - 12º', 'PP47',  'PP48'),
        (60, 5, 'C2', '9º - 10º',  'GP47',  'GP48'),

        (61, 5, 'C1', '7º - 8º', '4°ZA1',   '4°ZA2'),
        (62, 5, 'C2', '5º - 6º', '3°ZA1',   '3°ZA2'),
        (63, 5, 'C1', '3º - 4º', '2°ZA1',   '2°ZA2'),
        (64, 5, 'C2', '1º - 2º', '1°ZA1',   '1°ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 41:
            return 2
        if n <= 52:
            return 3
        if n <= 56:
            return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        z = str(zone).strip()
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            # BYE real o partido "informativo" (41: 21º … PP30)
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE' or (n == 41 and z == '21º')),
        })

    return matches

# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 23 EQUIPOS (según muestra_gpt_23_EQ.pdf)
# ------------------------------------------------------------



def generate_23_team_full_tournament(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 23 equipos (7 zonas de 3 + 1 zona de 2) + fase final,
    según el PDF 'muestra_gpt_23_EQ.pdf'.

    Devuelve partidos con:
      number, (day), (field), zone, home, away, round
    El frontend usa home, away, zone, round.
    """
    if len(teams) != 23:
        raise ValueError('Este fixture está definido sólo para 23 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # --- Fase regular (1–24) ---
    # Nota: en 23 equipos, la zona H tiene 2 equipos (22 y 23) → el "partido 16" no existe en el PDF.
    regular_specs = [
        (1,  1, 'C1', 'A',  1,  2),
        (2,  1, 'C2', 'C',  7,  8),
        (3,  1, 'C1', 'B',  4,  5),
        (4,  1, 'C2', 'D', 10, 11),
        (5,  1, 'C1', 'E', 13, 14),
        (6,  1, 'C2', 'G', 19, 20),
        (7,  1, 'C1', 'F', 16, 17),
        (8,  1, 'C2', 'H', 22, 23),

        (9,  1, 'C1', 'A',  2,  3),
        (10, 1, 'C2', 'C',  8,  9),
        (11, 1, 'C1', 'B',  5,  6),
        (12, 1, 'C2', 'D', 11, 12),

        (13, 2, 'C1', 'E', 14, 15),
        (14, 2, 'C2', 'G', 20, 21),
        (15, 2, 'C1', 'F', 17, 18),
        # (16) no existe en 23 equipos (en el PDF figura vacío)

        (17, 2, 'C1', 'A',  3,  1),
        (18, 2, 'C2', 'C',  9,  7),
        (19, 2, 'C1', 'B',  6,  4),
        (20, 2, 'C2', 'D', 12, 10),
        (21, 2, 'C1', 'E', 15, 13),
        (22, 2, 'C2', 'G', 21, 19),
        (23, 2, 'C1', 'F', 18, 16),
        (24, 2, 'C2', 'H', 23, 22),
    ]

    for n, day, field, zone, h, a in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h),
            'away': seed_name(a),
            'round': 1,
        })

    # --- Fase eliminatoria / definición (25–64) ---
    # Copiado tal como está en el PDF (incluye BYE y referencias PP/GP).
    elim_specs = [
        (25, 3, 'C1', 'ZA1',      '1°Z1',  '1°Z3'),
        (26, 3, 'C2', 'ZA1',      '1°Z5',  '1°Z7'),
        (27, 3, 'C1', 'ZA2',      '1°Z2',  '1°Z4'),
        (28, 3, 'C2', 'ZA2',      '1°Z6',  '1°Z8'),

        (29, 3, 'C1', 'LLAVE C',  '3°Z1',  '3°Z3'),
        (30, 3, 'C2', 'LLAVE C',  '3°Z5',  '3°Z7'),
        (31, 3, 'C1', 'LLAVE C',  '3°Z2',  '3°Z4'),
        (32, 3, 'C2', 'LLAVE C',  '3°Z6',  'BYE'),

        (33, 3, 'C1', 'LLAVE B',  '2°Z1',  '2°Z3'),
        (34, 3, 'C2', 'LLAVE B',  '2°Z5',  '2°Z7'),
        (35, 3, 'C1', 'LLAVE B',  '2°Z2',  '2°Z4'),
        (36, 3, 'C2', 'LLAVE B',  '2°Z6',  '2°Z8'),

        (37, 3, 'C1', 'ZA1',      '1°Z3',  '1°Z5'),
        (38, 3, 'C2', 'ZA1',      '1°Z7',  '1°Z1'),
        (39, 3, 'C1', 'ZA2',      '1°Z4',  '1°Z6'),
        (40, 3, 'C2', 'ZA2',      '1°Z8',  '1°Z2'),

        (41, 4, 'C1', 'LLAVE C',  'PP29',  'PP30'),
        (42, 4, 'C2', 'LLAVE C',  'PP31',  'BYE'),
        (43, 4, 'C1', 'LLAVE C',  'GP29',  'GP30'),
        (44, 4, 'C2', 'LLAVE C',  'GP31',  'GP32'),

        (45, 4, 'C1', 'LLAVE B',  'PP33',  'PP34'),
        (46, 4, 'C2', 'LLAVE B',  'PP35',  'PP36'),
        (47, 4, 'C1', 'LLAVE B',  'GP33',  'GP34'),
        (48, 4, 'C2', 'LLAVE B',  'GP35',  'GP36'),

        (49, 4, 'C1', 'ZA1',      '1°Z1',  '1°Z5'),
        (50, 4, 'C2', 'ZA1',      '1°Z7',  '1°Z3'),
        (51, 4, 'C1', 'ZA2',      '1°Z2',  '1°Z6'),
        (52, 4, 'C2', 'ZA2',      '1°Z8',  '1°Z4'),

        (53, 4, '', '23º', '', 'PP41'),
        (54, 4, 'C2', '21º - 22º','GP41',  'PP31'),
        (55, 4, 'C1', '19º - 20º','PP43',  'PP44'),
        (56, 4, 'C2', '17º - 18º','GP43',  'GP44'),

        (57, 5, 'C1', '15º - 16º','PP45',  'PP46'),
        (58, 5, 'C2', '13º - 14º','GP45',  'GP46'),
        (59, 5, 'C1', '11º - 12º','PP47',  'PP48'),
        (60, 5, 'C2', '9º - 10º', 'GP47',  'GP48'),

        (61, 5, 'C1', '7º - 8º',  '4°ZA1', '4°ZA2'),
        (62, 5, 'C2', '5º - 6º',  '3°ZA1', '3°ZA2'),
        (63, 5, 'C1', '3º - 4º',  '2°ZA1', '2°ZA2'),
        (64, 5, 'C2', '1º - 2º',  '1°ZA1', '1°ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 40:
            return 2
        if n <= 52:
            return 3
        if n <= 56:
            return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            # ✅ BYE / partido sin rival real (incluye el Nº53 en 23 equipos sembrado)
            '_is_bye': (str(h).strip().upper() == 'BYE'
                        or str(a).strip().upper() == 'BYE'
                        or (n == 53 and str(zone).strip() == '23º')),
        })
    _fix_regular_rounds(matches)
    return matches

def generate_23_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 23 equipos en sistema 4x6 (4 zonas: 6+6+6+5) + fase final,
    según el PDF '4X6_muestra_gpt_23_EQ.pdf'.

    NOTA: en la fase regular el PDF deja filas vacías (sin partido) en los Nros: 11, 22, 35, 48, 60.
    Acá NO generamos esos partidos (quedan "huecos" de numeración).
    """
    if len(teams) != 23:
        raise ValueError('Este fixture está definido sólo para 23 equipos (4x6).')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1..60 con huecos)
    # -------------------------
    regular_specs = [
        ( 1, 1, '', '1',  1,  2, 1),
        ( 2, 1, '', '1',  6,  3, 1),
        ( 3, 1, '', '1',  5,  4, 1),
        ( 4, 1, '', '2',  7,  8, 1),
        ( 5, 1, '', '2', 12,  9, 1),
        ( 6, 1, '', '2', 11, 10, 1),
        ( 7, 1, '', '3', 13, 14, 1),
        ( 8, 1, '', '3', 18, 15, 1),
        ( 9, 1, '', '3', 17, 16, 1),
        (10, 1, '', '4', 19, 20, 1),
        (12, 1, '', '4', 23, 22, 1),
        (13, 1, '', '1',  1,  6, 2),
        (14, 1, '', '1',  2,  3, 2),
        (15, 1, '', '1',  4,  5, 2),
        (16, 1, '', '2',  7, 12, 2),
        (17, 1, '', '2',  8,  9, 2),
        (18, 1, '', '2', 10, 11, 2),
        (19, 1, '', '3', 13, 18, 2),
        (20, 1, '', '3', 17, 14, 2),
        (21, 1, '', '3', 16, 15, 2),
        (23, 1, '', '4', 23, 20, 2),
        (24, 1, '', '4', 22, 21, 2),
        (25, 2, '', '1',  1,  5, 3),
        (26, 2, '', '1',  4,  6, 3),
        (27, 2, '', '1',  3,  2, 3),
        (28, 2, '', '2',  7, 11, 3),
        (29, 2, '', '2', 10, 12, 3),
        (30, 2, '', '2',  9,  8, 3),
        (31, 2, '', '3', 13, 17, 3),
        (32, 2, '', '3', 16, 18, 3),
        (33, 2, '', '3', 15, 14, 3),
        (34, 2, '', '4', 19, 23, 3),
        (36, 2, '', '4', 21, 20, 3),
        (37, 2, '', '1',  1,  4, 4),
        (38, 2, '', '1',  3,  5, 4),
        (39, 2, '', '1',  2,  6, 4),
        (40, 2, '', '2',  7, 10, 4),
        (41, 2, '', '2',  9, 11, 4),
        (42, 2, '', '2',  8, 12, 4),
        (43, 2, '', '3', 13, 16, 4),
        (44, 2, '', '3', 15, 17, 4),
        (45, 2, '', '3', 14, 18, 4),
        (46, 2, '', '4', 19, 22, 4),
        (47, 2, '', '4', 21, 23, 4),
        (49, 3, '', '1',  1,  3, 5),
        (50, 3, '', '1',  2,  4, 5),
        (51, 3, '', '1',  6,  5, 5),
        (52, 3, '', '2',  7,  9, 5),
        (53, 3, '', '2',  8, 10, 5),
        (54, 3, '', '2', 12, 11, 5),
        (55, 3, '', '3', 13, 15, 5),
        (56, 3, '', '3', 14, 16, 5),
        (57, 3, '', '3', 18, 17, 5),
        (58, 3, '', '4', 19, 21, 5),
        (59, 3, '', '4', 20, 22, 5),
    ]

    for n, day, field, zone, hs, as_, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(hs),
            'away': seed_name(as_),
            'round': rnd,
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (61..84)
    # -------------------------
    elim_specs = [
        (61, 4, '', 'LLAVE F', '6to. Z1', '6to. Z3', 1),
        (62, 4, '', 'LLAVE F', '6to. Z2', 'BYE', 1),
        (63, 4, '', 'LLAVE E', '5to. Z1', '5to. Z3', 1),
        (64, 4, '', 'LLAVE E', '5to. Z2', '5to. Z4', 1),
        (65, 4, '', 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, '', 'LLAVE D', '4to. Z2', '4to. Z4', 1),
        (67, 4, '', 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, '', 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),
        (69, 4, '', 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, '', 'LLAVE B', '2do. Z2', '2do. Z4', 1),
        (71, 4, '', 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, '', 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),
        (73, 5, '', '23º', 'PP61', '', 2),
        (74, 5, '', '21º - 22º', 'GP61', 'GP62', 2),
        (75, 5, '', '19º - 20º', 'PP63', 'PP64', 2),
        (76, 5, '', '17º - 18º', 'GP63', 'GP64', 2),
        (77, 5, '', '15º - 16º', 'PP65', 'PP66', 2),
        (78, 5, '', '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, '', '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, '', '9º - 10º', 'GP67', 'GP68', 2),
        (81, 5, '', '7º - 8º', 'PP69', 'PP70', 2),
        (82, 5, '', '5º - 6º', 'GP69', 'GP70', 2),
        (83, 5, '', '3º - 4º', 'PP71', 'PP72', 2),
        (84, 5, '', '1º - 2º', 'GP71', 'GP72', 2),
    ]

    for n, day, field, zone, h, a, rnd in elim_specs:
        hh = str(h or '').strip()
        aa = str(a or '').strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': hh,
            'away': aa,
            'round': rnd,
            # BYE real (partido 62) o partido informativo sin rival (partido 73)
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE' or aa == ''),
        })

    return matches

# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 22 EQUIPOS (4x6) — según 4X6_muestra_gpt_22_EQ.pdf
#  OJO: el PDF usa semillas 1..11 y 13..23 (NO usa la 12) => 22 equipos reales
# ------------------------------------------------------------
def generate_22_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 22 equipos en sistema 4x6 según el PDF 4X6_muestra_gpt_22_EQ.pdf.

    - Zonas del PDF (semillas):
        Z1: 1,2,3,4,5,6
        Z2: 7,8,9,10,11       (5 equipos)
        Z3: 13,14,15,16,17,18
        Z4: 19,20,21,22,23    (5 equipos)

    - El PDF NO usa la semilla 12.
      Mapeo semillas -> índice en teams (22 equipos reales):
        1..11 -> teams[0..10]
        13..23 -> teams[11..21]

    Devuelve dicts con:
      number, day, field, zone, home, away, round, _is_bye
    """
    if len(teams) != 22:
        raise ValueError("Este fixture está definido sólo para 22 equipos (4x6).")

    seed_to_index = {
        **{i: i - 1 for i in range(1, 12)},      # 1..11 -> 0..10
        **{i: i - 2 for i in range(13, 24)},     # 13..23 -> 11..21 (se salta la 12)
    }

    def seed_name(seed: int) -> str:
        idx = seed_to_index.get(seed, None)
        if idx is None:
            return f"Equipo {seed}"
        return teams[idx].name if 0 <= idx < len(teams) else f"Equipo {seed}"

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–60) — EXACTO (con huecos como en el PDF)
    # (N° partido, día, field, zona, seed_local, seed_visitante, ronda)
    # -------------------------
    regular_specs = [
        (1, 1, '', '1', 1, 2, 1),
        (2, 1, '', '1', 6, 3, 1),
        (3, 1, '', '1', 5, 4, 1),
        (4, 1, '', '2', 7, 8, 1),
        (6, 1, '', '2', 11, 10, 1),
        (7, 1, '', '3', 13, 14, 1),
        (8, 1, '', '3', 18, 15, 1),
        (9, 1, '', '3', 17, 16, 1),
        (10, 1, '', '4', 19, 20, 1),
        (12, 1, '', '4', 23, 22, 1),

        (13, 1, '', '1', 1, 6, 2),
        (14, 1, '', '1', 5, 2, 2),
        (15, 1, '', '1', 4, 3, 2),
        (17, 1, '', '2', 11, 8, 2),
        (18, 1, '', '2', 10, 9, 2),
        (19, 1, '', '3', 13, 18, 2),
        (20, 1, '', '3', 17, 14, 2),
        (21, 1, '', '3', 16, 15, 2),
        (23, 1, '', '4', 23, 20, 2),
        (24, 1, '', '4', 22, 21, 2),

        (25, 2, '', '1', 1, 5, 3),
        (26, 2, '', '1', 4, 6, 3),
        (27, 2, '', '1', 3, 2, 3),
        (28, 2, '', '2', 7, 11, 3),
        (30, 2, '', '2', 9, 8, 3),
        (31, 2, '', '3', 13, 17, 3),
        (32, 2, '', '3', 16, 18, 3),
        (33, 2, '', '3', 15, 14, 3),
        (34, 2, '', '4', 19, 23, 3),
        (36, 2, '', '4', 21, 20, 3),

        (37, 2, '', '1', 1, 4, 4),
        (38, 2, '', '1', 3, 5, 4),
        (39, 2, '', '1', 2, 6, 4),
        (40, 2, '', '2', 7, 10, 4),
        (41, 2, '', '2', 9, 11, 4),
        (43, 2, '', '3', 13, 16, 4),
        (44, 2, '', '3', 15, 17, 4),
        (45, 2, '', '3', 14, 18, 4),
        (46, 2, '', '4', 19, 22, 4),
        (47, 2, '', '4', 21, 23, 4),

        (49, 3, '', '1', 1, 3, 5),
        (50, 3, '', '1', 2, 4, 5),
        (51, 3, '', '1', 6, 5, 5),
        (52, 3, '', '2', 7, 9, 5),
        (53, 3, '', '2', 8, 10, 5),
        (55, 3, '', '3', 13, 15, 5),
        (56, 3, '', '3', 14, 16, 5),
        (57, 3, '', '3', 18, 17, 5),
        (58, 3, '', '4', 19, 21, 5),
        (59, 3, '', '4', 20, 22, 5),
    ]

    for (num, day, field, zone, sh, sa, rnd) in regular_specs:
        matches.append({
            "number": num,
            "day": day,
            "field": field,
            "zone": zone,
            "home": seed_name(sh),
            "away": seed_name(sa),
            "round": rnd,
            "_is_bye": False,
        })

    # -------------------------
    # FASE FINAL (63–72 día 4, 74–84 día 5) — EXACTO como el PDF
    # -------------------------
    final_specs = [
        (63, 4, '', 'LLAVE E', '5to. Z1', '5to. Z3', 1),
        (64, 4, '', 'LLAVE E', '5to. Z2', '5to. Z4', 1),
        (65, 4, '', 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, '', 'LLAVE D', '4to. Z2', '4to. Z4', 1),
        (67, 4, '', 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, '', 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),
        (69, 4, '', 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, '', 'LLAVE B', '2do. Z2', '2do. Z4', 1),
        (71, 4, '', 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, '', 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),

        (74, 5, '', '21º - 22º', '6to. Z1', '6to. Z3', 2),
        (75, 5, '', '19º - 20º', 'PP63', 'PP64', 2),
        (76, 5, '', '17º - 18º', 'GP63', 'GP64', 2),
        (77, 5, '', '15º - 16º', 'PP65', 'PP66', 2),
        (78, 5, '', '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, '', '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, '', '9º - 10º', 'GP67', 'GP68', 2),
        (81, 5, '', '7º - 8º', 'PP69', 'PP70', 2),
        (82, 5, '', '5º - 6º', 'GP69', 'GP70', 2),
        (83, 5, '', '3º - 4º', 'PP71', 'PP72', 2),
        (84, 5, '', '1º - 2º', 'GP71', 'GP72', 2),
    ]

    for (num, day, field, zone, h, a, rnd) in final_specs:
        matches.append({
            "number": num,
            "day": day,
            "field": field,
            "zone": zone,
            "home": h,
            "away": a,
            "round": rnd,
            "_is_bye": False,
        })

    return matches

# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 22 EQUIPOS (según muestra_gpt_22_EQ.pdf)
#  6 zonas de 3 (A-F) + 2 zonas de 2 (G,H con ida y vuelta)
# ------------------------------------------------------------

def generate_23_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture para **23 equipos** en sistema **8x3 Sembrado**.

    - Fase regular: igual a generate_23_team_full_tournament (7 zonas de 3 + 1 zona de 2 con ida/vuelta).
    - Fase final: igual estructura general, pero con placeholders *sembrados* y con el BYE principal en el
      **partido 29** (no en el 32), tal como lo definiste para '8x3 Sembrado'.

    Devuelve partidos con:
      number, (day), (field), zone, home, away, round
    """
    if len(teams) != 23:
        raise ValueError('Este fixture está definido sólo para 23 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # --- Fase regular (1–24) ---
    # Nota: en 23 equipos, la zona H tiene 2 equipos (22 y 23) → el "partido 16" no existe.
    regular_specs = [
        (1,  1, 'C1', 'A',  1,  2),
        (2,  1, 'C2', 'C',  7,  8),
        (3,  1, 'C1', 'B',  4,  5),
        (4,  1, 'C2', 'D', 10, 11),
        (5,  1, 'C1', 'E', 13, 14),
        (6,  1, 'C2', 'G', 19, 20),
        (7,  1, 'C1', 'F', 16, 17),
        (8,  1, 'C2', 'H', 22, 23),

        (9,  1, 'C1', 'A',  2,  3),
        (10, 1, 'C2', 'C',  8,  9),
        (11, 1, 'C1', 'B',  5,  6),
        (12, 1, 'C2', 'D', 11, 12),
        (13, 1, 'C1', 'E', 14, 15),
        (14, 1, 'C2', 'G', 20, 21),
        (15, 1, 'C1', 'F', 17, 18),

        (17, 2, 'C1', 'A',  3,  1),
        (18, 2, 'C2', 'C',  9,  7),
        (19, 2, 'C1', 'B',  6,  4),
        (20, 2, 'C2', 'D', 12, 10),
        (21, 2, 'C1', 'E', 15, 13),
        (22, 2, 'C2', 'G', 21, 19),
        (23, 2, 'C1', 'F', 18, 16),
        (24, 2, 'C2', 'H', 23, 22),
    ]

    def rr_round_for_zone_match(zone: str, number: int) -> int:
        # Mapea la "ronda" de la fase regular (A..F tienen 3 rondas; G/H tienen 2).
        if zone in ('G', 'H'):
            return 1 if number in (6, 8, 14, 24) else 2
        # Para A..F:
        if number <= 8:
            return 1
        if number <= 15:
            return 2
        return 3

    for (n, day, field, zone, h, a) in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h),
            'away': seed_name(a),
            'round': rr_round_for_zone_match(zone, n),
        })

    # --- Fase eliminatoria / definición (25–64) ---
    # PLACEHOLDERS sembrados + BYE principal en el partido 29 (según tu tabla).
    elim_specs = [
        (25, 3, 'C1', 'ZA1',      '1er. 1º',    '4to. 1º'),
        (26, 3, 'C2', 'ZA1',      '2do. 1º',    '3er. 1º'),
        (27, 3, 'C1', 'ZA2',      '5to. 1º',    '8vo. 1º'),
        (28, 3, 'C2', 'ZA2',      '6to. 1º',    '7mo. 1º'),

        (29, 3, '',   'LLAVE C',  '1er. 3º',    'BYE'),
        (30, 3, 'C2', 'LLAVE C',  '4to. 3º',    '5to. 3º'),
        (31, 3, 'C1', 'LLAVE C',  '3er. 3º',    '6to. 3º'),
        (32, 3, 'C2', 'LLAVE C',  '2do. 3º',    '7mo. 3º'),

        (33, 3, 'C1', 'LLAVE B',  '1er. 2º',    '8vo. 2º'),
        (34, 3, 'C2', 'LLAVE B',  '4to. 2º',    '5to. 2º'),
        (35, 3, 'C1', 'LLAVE B',  '3er. 2º',    '6to. 2º'),
        (36, 3, 'C2', 'LLAVE B',  '2do. 2º',    '7mo. 2º'),

        (37, 3, 'C1', 'ZA1',      '1er. 1º',    '5to. 1º'),
        (38, 3, 'C2', 'ZA1',      '2do. 1º',    '6to. 1º'),
        (39, 3, 'C1', 'ZA2',      '8vo. 1º',    '4to. 1º'),
        (40, 3, 'C2', 'ZA2',      '7mo. 1º',    '3er. 1º'),

        (41, 4, 'C1', 'LLAVE C',  'BYE',        'PP30'),
        (42, 4, 'C2', 'LLAVE C',  'PP31',       'PP32'),
        (43, 4, 'C1', 'LLAVE C',  'GP29',       'GP30'),
        (44, 4, 'C2', 'LLAVE C',  'GP31',       'GP32'),

        (45, 4, 'C1', 'LLAVE B',  'PP33',       'PP34'),
        (46, 4, 'C2', 'LLAVE B',  'PP35',       'PP36'),
        (47, 4, 'C1', 'LLAVE B',  'GP33',       'GP34'),
        (48, 4, 'C2', 'LLAVE B',  'GP35',       'GP36'),

        (49, 4, 'C1', 'ZA1',      '1er. 1º',    '8vo. 1º'),
        (50, 4, 'C2', 'ZA1',      '2do. 1º',    '7mo. 1º'),
        (51, 4, 'C1', 'ZA2',      '4to. 1º',    '5to. 1º'),
        (52, 4, 'C2', 'ZA2',      '3er. 1º',    '6to. 1º'),

        # En 23 equipos no existe el 24º: el '23º' queda asignado sin partido real.
        (53, 4, '', '23º', '', 'PP41'),
        (54, 4, 'C2', '21º - 22º','PP30',       'GP42'),
        (55, 4, 'C1', '19º - 20º','PP43',       'PP44'),
        (56, 4, 'C2', '17º - 18º','GP43',       'GP44'),

        (57, 5, 'C1', '15º - 16º','PP45',       'PP46'),
        (58, 5, 'C2', '13º - 14º','GP45',       'GP46'),
        (59, 5, 'C1', '11º - 12º','PP47',       'PP48'),
        (60, 5, 'C2', '9º - 10º', 'GP47',       'GP48'),

        (61, 5, 'C1', '7º - 8º',  '4to. ZA1',   '4to. ZA2'),
        (62, 5, 'C2', '5º - 6º',  '3ro. ZA1',   '3ro. ZA2'),
        (63, 5, 'C1', '3º - 4º',  '2do. ZA1',   '2do. ZA2'),
        (64, 5, 'C2', '1º - 2º',  '1ro. ZA1',   '1ro. ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 40:
            return 2
        if n <= 52:
            return 3
        if n <= 56:
            return 4
        if n <= 60:
            return 5
        return 6

    for (n, day, field, zone, home, away) in elim_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': home,
            'away': away,
            'round': round_for_number(n),
        })
    _fix_regular_rounds(matches)
    return matches



def generate_22_team_full_tournament(teams: List[Team]) -> List[Dict[str, Any]]:
    if len(teams) != 22:
        raise ValueError('Este fixture está definido sólo para 22 equipos.')

    # En el PDF se usan seeds: 1..20 y luego 22 y 23 (faltan 21 y 24)
    # Mapeo:
    #   seed 1..20 -> teams[0..19]
    #   seed 22    -> teams[20]
    #   seed 23    -> teams[21]
    def seed_name(seed: int) -> str:
        if 1 <= seed <= 20:
            return teams[seed - 1].name
        if seed == 22:
            return teams[20].name
        if seed == 23:
            return teams[21].name
        return f'SEED_{seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24)
    # -------------------------
    # Copiado del PDF. Hay dos "huecos" (14 y 16) porque G y H son zonas de 2 equipos.
    regular_specs = [
        (1,  1, 'C1', 'A',  1,  2),
        (2,  1, 'C2', 'C',  7,  8),
        (3,  1, 'C1', 'B',  4,  5),
        (4,  1, 'C2', 'D', 10, 11),
        (5,  1, 'C1', 'E', 13, 14),
        (6,  1, 'C2', 'G', 19, 20),   # ida (zona de 2)
        (7,  1, 'C1', 'F', 16, 17),
        (8,  1, 'C2', 'H', 22, 23),   # ida (zona de 2)

        (9,  1, 'C1', 'A',  2,  3),
        (10, 1, 'C2', 'C',  8,  9),
        (11, 1, 'C1', 'B',  5,  6),
        (12, 1, 'C2', 'D', 11, 12),

        (13, 2, 'C1', 'E', 14, 15),
        # (14) vacío en el PDF
        (15, 2, 'C1', 'F', 17, 18),
        # (16) vacío en el PDF

        (17, 2, 'C1', 'A',  3,  1),
        (18, 2, 'C2', 'C',  9,  7),
        (19, 2, 'C1', 'B',  6,  4),
        (20, 2, 'C2', 'D', 12, 10),
        (21, 2, 'C1', 'E', 15, 13),
        (22, 2, 'C2', 'G', 20, 19),   # vuelta (zona de 2)
        (23, 2, 'C1', 'F', 18, 16),
        (24, 2, 'C2', 'H', 23, 22),   # vuelta (zona de 2)
    ]

    for n, day, field, zone, h, a in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h),
            'away': seed_name(a),
            'round': 1,
        })

    # -------------------------
    # FASE FINAL (25–64)
    # -------------------------
    # Copiado del PDF (incluye BYE y PP/GP). No existe partido 53 en 22 equipos.
    elim_specs = [
        (25, 3, 'C1', 'ZA1',      '1°Z1',  '1°Z3'),
        (26, 3, 'C2', 'ZA1',      '1°Z5',  '1°Z7'),
        (27, 3, 'C1', 'ZA2',      '1°Z2',  '1°Z4'),
        (28, 3, 'C2', 'ZA2',      '1°Z6',  '1°Z8'),

        (29, 3, 'C1', 'LLAVE C',  '3°Z1',  '3°Z3'),
        (30, 3, 'C2', 'LLAVE C',  '3°Z5',  'BYE'),
        (31, 3, 'C1', 'LLAVE C',  '3°Z2',  '3°Z4'),
        (32, 3, 'C2', 'LLAVE C',  '3°Z6',  'BYE'),

        (33, 3, 'C1', 'LLAVE B',  '2°Z1',  '2°Z3'),
        (34, 3, 'C2', 'LLAVE B',  '2°Z5',  '2°Z7'),
        (35, 3, 'C1', 'LLAVE B',  '2°Z2',  '2°Z4'),
        (36, 3, 'C2', 'LLAVE B',  '2°Z6',  '2°Z8'),

        (37, 3, 'C1', 'ZA1',      '1°Z3',  '1°Z5'),
        (38, 3, 'C2', 'ZA1',      '1°Z7',  '1°Z1'),
        (39, 3, 'C1', 'ZA2',      '1°Z4',  '1°Z6'),
        (40, 3, 'C2', 'ZA2',      '1°Z8',  '1°Z2'),

        # En el PDF aparecen estos BYE intermedios:
        (41, 4, 'C1', 'LLAVE C',  'PP29',  'BYE'),
        (42, 4, 'C2', 'LLAVE C',  'PP31',  'BYE'),

        (43, 4, 'C1', 'LLAVE C',  'GP29',  'GP30'),
        (44, 4, 'C2', 'LLAVE C',  'GP31',  'GP32'),

        (45, 4, 'C1', 'LLAVE B',  'PP33',  'PP34'),
        (46, 4, 'C2', 'LLAVE B',  'PP35',  'PP36'),
        (47, 4, 'C1', 'LLAVE B',  'GP33',  'GP34'),
        (48, 4, 'C2', 'LLAVE B',  'GP35',  'GP36'),

        (49, 4, 'C1', 'ZA1',      '1°Z1',  '1°Z5'),
        (50, 4, 'C2', 'ZA1',      '1°Z7',  '1°Z3'),
        (51, 4, 'C1', 'ZA2',      '1°Z2',  '1°Z6'),
        (52, 4, 'C2', 'ZA2',      '1°Z8',  '1°Z4'),

        # (53) no existe en 22 equipos
        (54, 4, 'C2', '21º - 22º','PP29',  'PP31'),
        (55, 4, 'C1', '19º - 20º','PP43',  'PP44'),
        (56, 4, 'C2', '17º - 18º','GP43',  'GP44'),

        (57, 5, 'C1', '15º - 16º','PP45',  'PP46'),
        (58, 5, 'C2', '13º - 14º','GP45',  'GP46'),
        (59, 5, 'C1', '11º - 12º','PP47',  'PP48'),
        (60, 5, 'C2', '9º - 10º', 'GP47',  'GP48'),

        (61, 5, 'C1', '7º - 8º',  '4°ZA1', '4°ZA2'),
        (62, 5, 'C2', '5º - 6º',  '3°ZA1', '3°ZA2'),
        (63, 5, 'C1', '3º - 4º',  '2°ZA1', '2°ZA2'),
        (64, 5, 'C2', '1º - 2º',  '1°ZA1', '1°ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24: return 1
        if n <= 40: return 2
        if n <= 52: return 3
        if n <= 56: return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            # ✅ BYE / partido sin rival real (incluye el Nº53 en 23 equipos sembrado)
            '_is_bye': (str(h).strip().upper() == 'BYE'
                        or str(a).strip().upper() == 'BYE'
                        or (n == 53 and str(zone).strip() == '23º')),
        })
    _fix_regular_rounds(matches)
    return matches


# ------------------------------------------------------------
#  FIXTURE AUTOMÁTICO SENCILLO (POR SI USÁS /generate)
# ------------------------------------------------------------

def generate_fixture(
    teams: List[Team],
    system: str,
    days: int,
    fields: int,
    start_time: str,
    end_time: str,
    match_duration: int,
    rest: int,
    midday_break: Optional[Tuple[str, str]] = None,
    home_and_away: bool = False,
    max_matches_per_day: Optional[int] = None,
) -> List[Match]:
    """
    Versión simple: asigna los partidos de generate_match_list en orden
    a los horarios generados por generate_timeslots_list.
    """
    teams = assign_zones(list(teams), system)
    match_defs = generate_match_list(teams, system, home_and_away)
    slots = generate_timeslots_list(
        days=days,
        fields=fields,
        start_time=start_time,
        end_time=end_time,
        match_duration=match_duration,
        midday_break=midday_break,
    )

    if len(slots) < len(match_defs):
        raise RuntimeError('No hay suficientes horarios para todos los partidos.')

    schedule: List[Match] = []
    for match_def, slot in zip(match_defs, slots):
        schedule.append(
            Match(
                home=match_def['home'],
                away=match_def['away'],
                day=slot['day'],
                time=slot['time'],
                field=slot['field'],
                zone=match_def['zone'],
                round=match_def['round'],
            )
        )
    return schedule


# ------------------------------------------------------------
#  EXPORTACIÓN PDF (PARA /export_pdf)
# ------------------------------------------------------------

def export_to_pdf(
    schedule: List[Match],
    output_path: str,
    title: str = 'Fixture generado',
    header_image_path: Optional[str] = None,
) -> None:
    try:
        from fpdf import FPDF
    except ImportError as exc:
        raise RuntimeError('La biblioteca fpdf no está instalada.') from exc

    pdf = FPDF(orientation='L', unit='mm', format='A4')
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()

    if header_image_path:
        try:
            usable_w = pdf.w - 20
            pdf.image(header_image_path, x=10, y=8, w=usable_w)
            pdf.set_y(34)
        except Exception:
            pdf.set_y(10)

    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, title, ln=True, align='C')
    pdf.ln(4)

    pdf.set_font('Arial', 'B', 9)
    headers = ['Día', 'Hora', 'Cancha', 'Local', 'Visitante', 'Zona', 'Ronda']
    widths = [10, 18, 18, 55, 55, 10, 15]
    for h, w in zip(headers, widths):
        pdf.cell(w, 7, h, border=1, align='C')
    pdf.ln()

    pdf.set_font('Arial', '', 8)
    for m in schedule:
        row = [
            str(m.day) if m.day is not None else '',
            m.time or '',
            m.field or '',
            m.home,
            m.away,
            m.zone or '',
            str(m.round) if m.round is not None else '',
        ]
        for val, w in zip(row, widths):
            pdf.cell(w, 6, val, border=1, align='C')
        pdf.ln()

    pdf.output(output_path)

# ============================================================
#  MODELOS AGREGADOS (8x3 Sembrado): 19, 18, 17, 16 equipos
# ============================================================

def generate_19_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 19 equipos en sistema 8x3 Sembrado:
    - Fase regular:
        * Zonas A–E: 3 equipos (todos contra todos)
        * Zonas F y G: 2 equipos (ida y vuelta)
    - Fase final: según tu PDF de 19 equipos (números/días/llaves).

    Devuelve una lista de dicts con:
      number, day, field, zone, home, away, round, _is_bye
    """
    if len(teams) != 19:
        raise ValueError('Este fixture está definido sólo para 19 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–23)  ← (en el PDF hay números vacíos: 8, 14–16, 24)
    # -------------------------
    # Distribución por semillas (según la muestra):
    #   A: 1–3   B: 4–6   C: 7–9   D: 10–12   E: 13–15
    #   F: 16–17 (ida/vuelta)     G: 18–19 (ida/vuelta)
    regular_specs = [
        # Día 1 (Ronda 1)
        (1,  1, 'C1', 'A',  1,  2, 1),
        (2,  1, 'C2', 'C',  7,  8, 1),
        (3,  1, 'C1', 'B',  4,  5, 1),
        (4,  1, 'C2', 'D', 10, 11, 1),
        (5,  1, 'C1', 'E', 13, 14, 1),
        (6,  1, 'C2', 'G', 18, 19, 1),  # zona G (2 equipos) ida
        (7,  1, 'C1', 'F', 16, 17, 1),  # zona F (2 equipos) ida

        # Día 1 (Ronda 2)
        (9,  1, 'C1', 'A',  2,  3, 2),
        (10, 1, 'C2', 'C',  8,  9, 2),
        (11, 1, 'C1', 'B',  5,  6, 2),
        (12, 1, 'C2', 'D', 11, 12, 2),

        # Día 2
        (13, 2, 'C1', 'E', 14, 15, 2),

        # Día 2 (Ronda 3)
        (17, 2, 'C1', 'A',  3,  1, 3),
        (18, 2, 'C2', 'C',  9,  7, 3),
        (19, 2, 'C1', 'B',  6,  4, 3),
        (20, 2, 'C2', 'D', 12, 10, 3),
        (21, 2, 'C1', 'E', 15, 13, 3),

        # Día 2 (vueltas zonas de 2)
        (22, 2, 'C2', 'G', 19, 18, 2),  # zona G vuelta
        (23, 2, 'C1', 'F', 17, 16, 2),  # zona F vuelta
    ]

    for n, day, field, zone, hs, as_, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(hs),
            'away': seed_name(as_),
            'round': rnd,
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (25–64)  ← (en el PDF hay números vacíos: 24, 31–32, 41–42, 44, 53–56)
    # -------------------------
    # Ronda global (solo para mantener consistencia visual con el resto de fixtures)
    def round_for_number(num: int) -> int:
        if num <= 23:
            return 1
        if num <= 40:
            return 2
        if num <= 52:
            return 3
        if num <= 58:
            return 4
        return 5

    elim_specs = [
        # Día 3 — ZA1/ZA2
        (25, 3, 'C1', 'ZA1',     '1er. 1º', '4to. 1º'),
        (26, 3, 'C2', 'ZA1',     '5to. 1º', '1er. 2º'),
        (27, 3, 'C1', 'ZA2',     '2do. 1º', '3er. 1º'),
        (28, 3, 'C2', 'ZA2',     '6to. 1º', '7mo. 1º'),

        # Día 3 — LLAVE C
        (29, 3, 'C1', 'LLAVE C', '3er. 3º', 'BYE'),
        (30, 3, 'C2', 'LLAVE C', '4to. 3º', '5to. 3º'),

        # Día 3 — LLAVE B
        (33, 3, 'C1', 'LLAVE B', '2do. 2º', '2do. 3º'),
        (34, 3, 'C2', 'LLAVE B', '5to. 2º', '6to. 2º'),
        (35, 3, 'C1', 'LLAVE B', '4to. 2º', '7mo. 2º'),
        (36, 3, 'C2', 'LLAVE B', '1er. 3º', '3er. 2º'),

        # Día 3 — ZA1/ZA2 (continuación sembrada)
        (37, 3, 'C1', 'ZA1',     '5to. 1º', '1er. 1º'),
        (38, 3, 'C2', 'ZA1',     '1er. 2º', '4to. 1º'),
        (39, 3, 'C1', 'ZA2',     '6to. 1º', '2do. 1º'),
        (40, 3, 'C2', 'ZA2',     '7mo. 1º', '3er. 1º'),

        # Día 4 — 17º/18º
        (43, 4, 'C1', '17º - 18º', '3er. 3º', 'GP30'),

        # Día 4 — LLAVE B
        (45, 4, 'C1', 'LLAVE B', 'PP33', 'PP34'),
        (46, 4, 'C2', 'LLAVE B', 'PP35', 'PP36'),
        (47, 4, 'C1', 'LLAVE B', 'GP33', 'GP34'),
        (48, 4, 'C2', 'LLAVE B', 'GP35', 'GP36'),

        # Día 4 — ZA1/ZA2
        (49, 4, 'C1', 'ZA1', '1er. 2º', '1er. 1º'),
        (50, 4, 'C2', 'ZA1', '4to. 1º', '5to. 1º'),
        (51, 4, 'C1', 'ZA2', '7mo. 1º', '2do. 1º'),
        (52, 4, 'C2', 'ZA2', '3er. 1º', '6to. 1º'),
        (55, 4, '', '19º', 'PP30', ''),

        # Día 4 — Puestos 15º–16º / 13º–14º
        (57, 4, 'C1', '15º - 16º', 'PP45', 'PP46'),
        (58, 4, 'C2', '13º - 14º', 'GP45', 'GP46'),

        # Día 5 — Puestos 11º–12º / 9º–10º
        (59, 5, 'C1', '11º - 12º', 'PP47', 'PP48'),
        (60, 5, 'C2', '9º - 10º',  'GP47', 'GP48'),

        # Día 5 — Definiciones ZA
        (61, 5, 'C1', '7º - 8º', '4°ZA1', '4°ZA2'),
        (62, 5, 'C2', '5º - 6º', '3°ZA1', '3°ZA2'),
        (63, 5, 'C1', '3º - 4º', '2°ZA1', '2°ZA2'),
        (64, 5, 'C2', '1º - 2º', '1°ZA1', '1°ZA2'),
    ]

    for n, day, field, zone, h, a in elim_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': round_for_number(n),
            '_is_bye': (str(h).strip().upper() == 'BYE' or str(a).strip().upper() == 'BYE'),
        })

    return matches

# ------------------------------------------------------------
#  FIXTURE COMPLETO PARA 20 EQUIPOS (8x3 Sembrado)
#  6 zonas de 3 (A-F) + 1 zona de 2 (G con ida/vuelta)
#  Fase final según cronograma de 20 equipos sembrado que pasaste
# ------------------------------------------------------------

def generate_18_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 18 equipos (8x3 Sembrado) según muestra_gpt_18_EQ.pdf:
    - Fase regular: 6 zonas de 3 (A–F) en 2 días, con numeración discontinua (vacíos: 6,8,15,16,22,24).
    - Fase final: partidos 25–64 con vacíos (30–32, 41–44, 53–56), según PDF.
    Nota: en el PDF la columna "Cancha" está vacía → field = ''.
    """
    if len(teams) != 18:
        raise ValueError('Este fixture está definido sólo para 18 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # Zonas (según PDF): A=(1,2,3), B=(4,5,6), C=(7,8,9), D=(10,11,12), E=(13,14,15), F=(16,17,18)
    zone_teams: Dict[str, List[int]] = {
        'A': [1, 2, 3],
        'B': [4, 5, 6],
        'C': [7, 8, 9],
        'D': [10, 11, 12],
        'E': [13, 14, 15],
        'F': [16, 17, 18],
    }

    # -------------------------
    # FASE REGULAR (1–24, con vacíos)
    # -------------------------
    regular_specs = [
        (1,  1, '', 'A', 1,  2),
        (2,  1, '', 'C', 7,  8),
        (3,  1, '', 'B', 4,  5),
        (4,  1, '', 'D', 10, 11),
        (5,  1, '', 'E', 13, 14),
        # (6) vacío
        (7,  1, '', 'F', 16, 17),
        # (8) vacío
        (9,  1, '', 'A', 2,  3),
        (10, 1, '', 'C', 8,  9),
        (11, 1, '', 'B', 5,  6),
        (12, 1, '', 'D', 11, 12),

        (13, 2, '', 'E', 14, 15),
        (14, 2, '', 'F', 17, 18),
        # (15) vacío
        # (16) vacío
        (17, 2, '', 'A', 3,  1),
        (18, 2, '', 'C', 9,  7),
        (19, 2, '', 'B', 6,  4),
        (20, 2, '', 'D', 12, 10),
        (21, 2, '', 'E', 15, 13),
        # (22) vacío
        (23, 2, '', 'F', 18, 16),
        # (24) vacío
    ]

    def rr_round_for_zone(zone: str, h_seed: int, a_seed: int) -> int:
        z = zone_teams.get(zone, [])
        if len(z) != 3:
            return 1
        pair = {h_seed, a_seed}
        if pair == {z[0], z[1]}:
            return 1
        if pair == {z[1], z[2]}:
            return 2
        if pair == {z[2], z[0]}:
            return 3
        return 1

    for n, day, field, zone, h, a in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h),
            'away': seed_name(a),
            'round': rr_round_for_zone(zone, h, a),
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (25–64, con vacíos) — EXACTO PDF
    # -------------------------
    elim_specs = [
        # Día 3
        (25, 3, '', 'ZA1', '1er. 1º', '4to. 1º'),
        (26, 3, '', 'ZA1', '5to. 1º', '2do. 2º'),
        (27, 3, '', 'ZA2', '2do. 1º', '3er. 1º'),
        (28, 3, '', 'ZA2', '6to. 1º', '1er. 2º'),
        (29, 3, '', '17º - 18º', '5to. 3º', '6to. 3º'),
        # 30-32 vacíos
        (33, 3, '', 'LLAVE B', '3er. 2º', '4to. 3º'),
        (34, 3, '', 'LLAVE B', '6to. 2º', '1er. 3º'),
        (35, 3, '', 'LLAVE B', '5to. 2º', '2do. 3º'),
        (36, 3, '', 'LLAVE B', '3er. 3º', '4to. 2º'),
        (37, 3, '', 'ZA1', '5to. 1º', '1er. 1º'),
        (38, 3, '', 'ZA1', '2do. 2º', '4to. 1º'),
        (39, 3, '', 'ZA2', '6to. 1º', '2do. 1º'),
        (40, 3, '', 'ZA2', '1er. 2º', '3er. 1º'),
        # 41-44 vacíos

        # Día 4
        (45, 4, '', 'LLAVE B', 'PP33', 'PP34'),
        (46, 4, '', 'LLAVE B', 'PP35', 'PP36'),
        (47, 4, '', 'LLAVE B', 'GP33', 'GP34'),
        (48, 4, '', 'LLAVE B', 'GP35', 'GP36'),
        (49, 4, '', 'ZA1', '2do. 2º', '1er. 1º'),
        (50, 4, '', 'ZA1', '4to. 1º', '5to. 1º'),
        (51, 4, '', 'ZA2', '1er. 2º', '2do. 1º'),
        (52, 4, '', 'ZA2', '3er. 1º', '6to. 1º'),
        # 53-56 vacíos
        (57, 4, '', '15º - 16º', 'PP45', 'PP46'),
        (58, 4, '', '13º - 14º', 'GP45', 'GP46'),

        # Día 5
        (59, 5, '', '11º - 12º', 'PP47', 'PP48'),
        (60, 5, '', '9º - 10º', 'GP47', 'GP48'),
        (61, 5, '', '7º - 8º', '4°ZA1', '4°ZA2'),
        (62, 5, '', '5º - 6º', '3°ZA1', '3°ZA2'),
        (63, 5, '', '3º - 4º', '2°ZA1', '2°ZA2'),
        (64, 5, '', '1º - 2º', '1°ZA1', '1°ZA2'),
    ]

    def elim_round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 40:
            return 2
        if n <= 52:
            return 3
        return 4

    for n, day, field, zone, h, a in elim_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': hh,
            'away': aa,
            'round': elim_round_for_number(n),
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE' or aa == ''),
        })

    return matches


def generate_17_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 17 equipos en sistema '8x3 Sembrado' (según muestra_gpt_17_EQ.pdf):
    - Fase regular: 5 zonas de 3 (A..E) + 1 zona de 2 (F: 16 vs 17 ida/vuelta).
      Numeración discontinua: no existen 6, 8, 14, 15, 16, 22, 24.
    - Fase final: partidos 25..64 con números vacíos (30-32, 41-44, 53-56).
      Partido 29 es un BYE "informativo" para 17º (se trata como BYE: no se auto-ubica en grilla).
    Nota: en este PDF la columna "Cancha" está vacía → usamos field = ''.
    """
    if len(teams) != 17:
        raise ValueError('Este fixture está definido sólo para 17 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24, con vacíos)
    # -------------------------
    # (N° partido, día, field, zona, seed_local, seed_visitante, ronda)
    regular_specs = [
        # Día 1
        (1,  1, '', 'A',  1,  2, 1),
        (2,  1, '', 'C',  7,  8, 1),
        (3,  1, '', 'B',  4,  5, 1),
        (4,  1, '', 'D', 10, 11, 1),
        (5,  1, '', 'E', 13, 14, 1),
        # (6) vacío
        (7,  1, '', 'F', 16, 17, 1),
        # (8) vacío
        (9,  1, '', 'A',  2,  3, 2),
        (10, 1, '', 'C',  8,  9, 2),
        (11, 1, '', 'B',  5,  6, 2),
        (12, 1, '', 'D', 11, 12, 2),

        # Día 2
        (13, 2, '', 'E', 14, 15, 2),
        # (14) vacío
        # (15) vacío
        # (16) vacío
        (17, 2, '', 'A',  3,  1, 3),
        (18, 2, '', 'C',  9,  7, 3),
        (19, 2, '', 'B',  6,  4, 3),
        (20, 2, '', 'D', 12, 10, 3),
        (21, 2, '', 'E', 15, 13, 3),
        # (22) vacío
        (23, 2, '', 'F', 17, 16, 2),
        # (24) vacío
    ]

    for n, day, field, zone, h_seed, a_seed, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h_seed),
            'away': seed_name(a_seed),
            'round': rnd,
        })

    # -------------------------
    # FASE FINAL (25–64, con vacíos)
    # -------------------------
    # (N° partido, día, field, zona, equipo_local, equipo_visitante)
    elim_specs = [
        # Día 3
        (25, 3, '', 'ZA1', '1er. 1º', '4to. 1º'),
        (26, 3, '', 'ZA1', '5to. 1º', '2do. 2º'),
        (27, 3, '', 'ZA2', '2do. 1º', '3er. 1º'),
        (28, 3, '', 'ZA2', '6to. 1º', '1er. 2º'),
        (29, 3, '', '17º', '5to. 3º', ''),  # BYE informativo (no existe rival)

        (33, 3, '', 'LLAVE B', '3er. 2º', '4to. 3º'),
        (34, 3, '', 'LLAVE B', '6to. 2º', '1er. 3º'),
        (35, 3, '', 'LLAVE B', '5to. 2º', '2do. 3º'),
        (36, 3, '', 'LLAVE B', '3er. 3º', '4to. 2º'),
        (37, 3, '', 'ZA1', '5to. 1º', '1er. 1º'),
        (38, 3, '', 'ZA1', '2do. 2º', '4to. 1º'),
        (39, 3, '', 'ZA2', '6to. 1º', '2do. 1º'),
        (40, 3, '', 'ZA2', '1er. 2º', '3er. 1º'),

        # Día 4
        (45, 4, '', 'LLAVE B', 'PP33', 'PP34'),
        (46, 4, '', 'LLAVE B', 'PP35', 'PP36'),
        (47, 4, '', 'LLAVE B', 'GP33', 'GP34'),
        (48, 4, '', 'LLAVE B', 'GP35', 'GP36'),
        (49, 4, '', 'ZA1', '2do. 2º', '1er. 1º'),
        (50, 4, '', 'ZA1', '4to. 1º', '5to. 1º'),
        (51, 4, '', 'ZA2', '1er. 2º', '2do. 1º'),
        (52, 4, '', 'ZA2', '3er. 1º', '6to. 1º'),

        (57, 4, '', '15º - 16º', 'PP45', 'PP46'),
        (58, 4, '', '13º - 14º', 'GP45', 'GP46'),

        # Día 5
        (59, 5, '', '11º - 12º', 'PP47', 'PP48'),
        (60, 5, '', '9º - 10º', 'GP47', 'GP48'),
        (61, 5, '', '7º - 8º', '4°ZA1', '4°ZA2'),
        (62, 5, '', '5º - 6º', '3°ZA1', '3°ZA2'),
        (63, 5, '', '3º - 4º', '2°ZA1', '2°ZA2'),
        (64, 5, '', '1º - 2º', '1°ZA1', '1°ZA2'),
    ]

    def round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 40:
            return 2
        if n <= 48:
            return 3
        if n <= 56:
            return 4
        return 5

    for n, day, field, zone, h, a in elim_specs:
        z = str(zone).strip()
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': z,
            'home': hh,
            'away': aa,
            'round': round_for_number(n),
            # BYE real o partido "informativo" 29: "17º  5to. 3º"
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE' or (n == 29 and z == '17º')),
        })

    return matches

#  FIXTURE COMPLETO PARA 20 EQUIPOS (8x3 Sembrado)
#  6 zonas de 3 (A-F) + 1 zona de 2 (G con ida/vuelta)
#  Fase final según cronograma de 20 equipos sembrado que pasaste
# ------------------------------------------------------------

def generate_16_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 16 equipos (sistema 8x3 Sembrado) según muestra_gpt_16_EQ.pdf,
    respetando rondas 1..3 en fase regular (4 equipos => 6 partidos => 3 rondas, 2 partidos por ronda).

    - Fase regular (1–24): 4 zonas de 4 (A, B, C, D) en 2 días.
      (En el PDF, la tabla de fase regular usa estas zonas y estos cruces.)
    - Fase final: Llave A (puestos 1º–8º) y Llave B (puestos 9º–16º) según PDF:
        Día 3: 29–32 (Llave B) y 33–36 (Llave A)
        Día 4: 41–44 (Llave B) y 45–48 (Llave A)
        Día 5: 53–60 (puestos)
    Nota: en el PDF la columna "Cancha" está vacía → field = ''.
    """
    if len(teams) != 16:
        raise ValueError('Este fixture está definido sólo para 16 equipos.')

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f'Equipo {seed}'

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24) — EXACTO como tabla del PDF (ver muestra)
    # -------------------------
    # (N° partido, día, field, zona, seed_local, seed_visitante, ronda)
    regular_specs = [
        # Día 1 — Ronda 1 (2 partidos por zona, repartidos en la grilla)
        (1,  1, '', 'A',  1,  2, 1),
        (2,  1, '', 'C',  5,  6, 1),
        (3,  1, '', 'B',  9, 10, 1),
        (4,  1, '', 'D', 13, 14, 1),
        (5,  1, '', 'A',  3,  4, 1),
        (6,  1, '', 'C',  7,  8, 1),
        (7,  1, '', 'B', 11, 12, 1),
        (8,  1, '', 'D', 15, 16, 1),

        # Día 1 — Ronda 2 (primeros 4 partidos de R2)
        (9,  1, '', 'A',  3,  1, 2),
        (10, 1, '', 'C',  7,  5, 2),
        (11, 1, '', 'B', 11,  9, 2),
        (12, 1, '', 'D', 15, 13, 2),

        # Día 2 — Ronda 2 (restantes 4 partidos de R2)
        (13, 2, '', 'A',  4,  2, 2),
        (14, 2, '', 'C',  8,  6, 2),
        (15, 2, '', 'B', 12, 10, 2),
        (16, 2, '', 'D', 16, 14, 2),

        # Día 2 — Ronda 3 (8 partidos)
        (17, 2, '', 'A',  2,  3, 3),
        (18, 2, '', 'C',  6,  7, 3),
        (19, 2, '', 'B', 10, 11, 3),
        (20, 2, '', 'D', 14, 15, 3),
        (21, 2, '', 'A',  4,  1, 3),
        (22, 2, '', 'C',  8,  5, 3),
        (23, 2, '', 'B', 12,  9, 3),
        (24, 2, '', 'D', 16, 13, 3),
    ]

    for n, day, field, zone, h_seed, a_seed, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h_seed),
            'away': seed_name(a_seed),
            'round': rnd,          # ✅ 1..3 en fase regular
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (según PDF)
    # -------------------------
    elim_specs = [
        # Día 3 — Llave B (9º al 16º)
        (29, 3, '', 'LLAVE B', '1er. 3º', '4to. 4º'),
        (30, 3, '', 'LLAVE B', '1er. 4º', '4to. 3º'),
        (31, 3, '', 'LLAVE B', '3er. 3º', '2do. 4º'),
        (32, 3, '', 'LLAVE B', '3er. 4º', '2do. 3º'),

        # Día 3 — Llave A (1º al 8º)
        (33, 3, '', 'LLAVE A', '1er. 1º', '4to. 2º'),
        (34, 3, '', 'LLAVE A', '1er. 2º', '4to. 1º'),
        (35, 3, '', 'LLAVE A', '3er. 1º', '2do. 2º'),
        (36, 3, '', 'LLAVE A', '3er. 2º', '2do. 1º'),

        # Día 4 — Llave B
        (41, 4, '', 'LLAVE B', 'PP29', 'PP30'),
        (42, 4, '', 'LLAVE B', 'PP31', 'PP32'),
        (43, 4, '', 'LLAVE B', 'GP29', 'GP30'),
        (44, 4, '', 'LLAVE B', 'GP31', 'GP32'),

        # Día 4 — Llave A
        (45, 4, '', 'LLAVE A', 'PP33', 'PP34'),
        (46, 4, '', 'LLAVE A', 'PP35', 'PP36'),
        (47, 4, '', 'LLAVE A', 'GP33', 'GP34'),
        (48, 4, '', 'LLAVE A', 'GP35', 'GP36'),

        # Día 5 — Puestos
        (53, 5, '', '15º - 16º', 'PP41', 'PP42'),
        (54, 5, '', '13º - 14º', 'GP41', 'GP42'),
        (55, 5, '', '11º - 12º', 'PP43', 'PP44'),
        (56, 5, '', '9º - 10º',  'GP43', 'GP44'),
        (57, 5, '', '7º - 8º',   'PP45', 'PP46'),
        (58, 5, '', '5º - 6º',   'GP45', 'GP46'),
        (59, 5, '', '3º - 4º',   'PP47', 'PP48'),
        (60, 5, '', '1º - 2º',   'GP47', 'GP48'),
    ]

    def elim_round_for_number(n: int) -> int:
        # Solo para agrupar visualmente en UI (no afecta auto-ubicar)
        if n <= 36:
            return 4
        if n <= 48:
            return 5
        return 6

    for n, day, field, zone, h, a in elim_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': elim_round_for_number(n),
            '_is_bye': (hh.upper() == 'BYE' or aa.upper() == 'BYE'),
        })

    return matches

# ============================================================
#  MODELO AGREGADO (8x3 Sembrado): 15 equipos (PDF corregido)
# ============================================================

def generate_15_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 15 equipos (sistema 8x3 Sembrado) según muestra_gpt_15_EQ.pdf (CORREGIDO).

    ZONAS Y EQUIPOS (según PDF):
      - Zona A: 1,2,3,4
      - Zona B: 5,6,7,8
      - Zona C: 9,10,11,12
      - Zona D: 13,14,15

    FASE REGULAR (1–24):
      - En el PDF los partidos 8, 16 y 24 están VACÍOS (no existen).
      - No existe ningún equipo "16".

    FASE FINAL (29–60):
      - Partidos 25–28, 37–40 y 49–52 vacíos (no existen).
      - BYE en 29 y 41.
      - Informativo 53: "15º … PP42" (sin hora/cancha; debe comportarse como BYE para auto-ubicar).
    """
    if len(teams) != 15:
        raise ValueError("Este fixture está definido sólo para 15 equipos.")

    def seed_name(seed: int) -> str:
        idx = seed - 1
        return teams[idx].name if 0 <= idx < len(teams) else f"Equipo {seed}"

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24) — EXACTO tabla del PDF (8,16,24 VACÍOS)
    # -------------------------
    # (nro, día, field, zona, seed_home, seed_away, ronda)
    regular_specs = [
        # Día 1
            (1,  1, '', 'A',  1,  2, 1),
            (2,  1, '', 'C',  9, 10, 1),
            (3,  1, '', 'B',  5,  6, 1),
            (4,  1, '', 'D', 13, 14, 1),
            (5,  1, '', 'A',  3,  4, 1),
            (6,  1, '', 'C', 11, 12, 1),
            (7,  1, '', 'B',  7,  8, 1),
            # (8) vacío

            (9,  1, '', 'A',  3,  1, 2),
            (10, 1, '', 'C', 11,  9, 2),
            (11, 1, '', 'B',  7,  5, 2),
            (12, 1, '', 'D', 15, 13, 2),

            # Día 2
            (13, 2, '', 'A',  4,  2, 2),
            (14, 2, '', 'C', 12, 10, 2),
            (15, 2, '', 'B',  8,  6, 2),
            # (16) vacío

            (17, 2, '', 'A',  2,  3, 3),
            (18, 2, '', 'C', 10, 11, 3),
            (19, 2, '', 'B',  6,  7, 3),
            (20, 2, '', 'D', 14, 15, 3),
            (21, 2, '', 'A',  4,  1, 3),
            (22, 2, '', 'C', 12,  9, 3),
            (23, 2, '', 'B',  8,  5, 3),
            # (24) vacío

    ]

    for n, day, field, zone, h_seed, a_seed, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(h_seed),
            'away': seed_name(a_seed),
            'round': rnd,          # ✅ 1..3
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (29–60) — EXACTO tabla del PDF
    # -------------------------
    elim_specs = [
        # Día 3 (25–28 vacíos)
        (29, 3, '', 'LLAVE B', '1er. 3º', 'BYE'),
        (30, 3, '', 'LLAVE B', '1er. 4º', '4to. 3º'),
        (31, 3, '', 'LLAVE B', '3er. 3º', '2do. 4º'),
        (32, 3, '', 'LLAVE B', '3er. 4º', '2do. 3º'),
        (33, 3, '', 'LLAVE A', '1er. 1º', '4to. 2º'),
        (34, 3, '', 'LLAVE A', '1er. 2º', '4to. 1º'),
        (35, 3, '', 'LLAVE A', '3er. 1º', '2do. 2º'),
        (36, 3, '', 'LLAVE A', '3er. 2º', '2do. 1º'),

        # Día 4 (37–40 vacíos)
        (41, 4, '', 'LLAVE B', 'BYE', 'PP30'),
        (42, 4, '', 'LLAVE B', 'PP31', 'PP32'),
        (43, 4, '', 'LLAVE B', '1er. 3º', 'GP30'),
        (44, 4, '', 'LLAVE B', 'GP31', 'GP32'),
        (45, 4, '', 'LLAVE A', 'PP33', 'PP34'),
        (46, 4, '', 'LLAVE A', 'PP35', 'PP36'),
        (47, 4, '', 'LLAVE A', 'GP33', 'GP34'),
        (48, 4, '', 'LLAVE A', 'GP35', 'GP36'),

        
        # Día 5 (49–52 vacíos)
        (53, 5, '',   '15º',     '',         'PP42'),  # ✅ informativo: "15º … PP42"
        (54, 5, '', '13º - 14º', 'PP30', 'GP42'),
        (55, 5, '', '11º - 12º', 'PP43', 'PP44'),
        (56, 5, '', '9º - 10º',  'GP43', 'GP44'),
        (57, 5, '', '7º - 8º',   'PP45', 'PP46'),
        (58, 5, '', '5º - 6º',   'GP45', 'GP46'),
        (59, 5, '', '3º - 4º',   'PP47', 'PP48'),
        (60, 5, '', '1º - 2º',   'GP47', 'GP48'),
    ]

    def elim_round_for_number(n: int) -> int:
        if 29 <= n <= 36:
            return 4
        if 41 <= n <= 48:
            return 5
        if 53 <= n <= 60:
            return 6
        return 0

    for n, day, field, zone, h, a in elim_specs:
        hh = str(h).strip()
        aa = str(a).strip()

        is_bye = (hh.upper() == 'BYE' or aa.upper() == 'BYE')
        # ✅ informativo 15º … PP42 (no auto-ubicar en grilla, sin hora/cancha en PDF)
        if str(zone).strip() == '15º' and aa.upper() == 'PP42':
            is_bye = True

        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': elim_round_for_number(n),
            '_is_bye': is_bye,
        })

    return matches
# ============================================================
#  MODELO AGREGADO (8x3 Sembrado): 14 equipos (muestra_gpt_14_EQ.pdf)
#  OJO: el PDF usa semillas 1..11 y 13..15 (NO usa la 12).
#  Para mapear 14 equipos reales (índices 0..13), hacemos:
#     1..11 -> equipos[0..10]
#     13    -> equipos[11]
#     14    -> equipos[12]
#     15    -> equipos[13]
# ============================================================

def generate_14_team_full_tournament_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 14 equipos (según muestra_gpt_14_EQ.pdf).

    ZONAS (según PDF):
      - Zona A: 1,2,3,4 (4 equipos)
      - Zona B: 5,6,7,8 (4 equipos)
      - Zona C: 9,10,11 (3 equipos)
      - Zona D: 13,14,15 (3 equipos)  <-- el PDF NO usa la semilla 12

    FASE REGULAR (1–24):
      - Existen: 1,2,3,4,5,7,9,10,11,12,13,15,17,18,19,20,21,23
      - Vacíos: 6,8,14,16,22,24

    FASE FINAL:
      - Día 3: 29..36 (LLAVE B / LLAVE A)
      - Día 4: 41..48 (LLAVE B / LLAVE A)
      - Día 5: 54..60 (puestos)
      - Partidos con BYE (29, 32, 41, 42) deben comportarse como BYE:
          * NO auto-ubicar
          * En PDF: SIEMPRE sin hora/cancha (esto ya se fuerza en app.py si _is_bye=True)
    """
    if len(teams) != 14:
        raise ValueError("Este fixture está definido sólo para 14 equipos.")

    seed_to_index = {
        # 1..11 -> 0..10
        **{i: i - 1 for i in range(1, 12)},
        # el PDF salta la 12
        13: 11,
        14: 12,
        15: 13,
    }

    def seed_name(seed: int) -> str:
        idx = seed_to_index.get(seed, None)
        if idx is None:
            return f"Equipo {seed}"
        return teams[idx].name if 0 <= idx < len(teams) else f"Equipo {seed}"

    matches: List[Dict[str, Any]] = []

    # -------------------------
    # FASE REGULAR (1–24) — EXACTO tabla del PDF (con vacíos)
    # -------------------------
    # (nro, día, field, zona, seed_home, seed_away, ronda)
    regular_specs = [
        # Día 1
        (1,  1, '', 'A',  1,  2, 1),
        (2,  1, '', 'C',  9, 10, 1),
        (3,  1, '', 'B',  5,  6, 1),
        (4,  1, '', 'D', 13, 14, 1),
        (5,  1, '', 'A',  3,  4, 1),
        # (6) vacío
        (7,  1, '', 'B',  7,  8, 1),
        # (8) vacío
        (9,  1, '', 'A',  3,  1, 2),
        (10, 1, '', 'C', 11,  9, 2),
        (11, 1, '', 'B',  7,  5, 2),
        (12, 1, '', 'D', 15, 13, 2),

        # Día 2
        (13, 2, '', 'A',  4,  2, 2),
        # (14) vacío
        (15, 2, '', 'B',  8,  6, 2),
        # (16) vacío
        (17, 2, '', 'A',  2,  3, 3),
        (18, 2, '', 'C', 10, 11, 3),
        (19, 2, '', 'B',  6,  7, 3),
        (20, 2, '', 'D', 14, 15, 3),
        (21, 2, '', 'A',  4,  1, 3),
        # (22) vacío
        (23, 2, '', 'B',  8,  5, 3),
        # (24) vacío
    ]

    for n, day, field, zone, hs, as_, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(hs),
            'away': seed_name(as_),
            'round': rnd,
            '_is_bye': False,
        })

    # -------------------------
    # FASE FINAL (29–60) — EXACTO tabla del PDF
    # -------------------------
    elim_specs = [
        # Día 3 — LLAVE B
        (29, 3, '', 'LLAVE B', '1er. 3º', 'BYE'),
        (30, 3, '', 'LLAVE B', '1er. 4º', '4to. 3º'),
        (31, 3, '', 'LLAVE B', '3er. 3º', '2do. 4º'),
        (32, 3, '', 'LLAVE B', 'BYE',     '2do. 3º'),

        # Día 3 — LLAVE A
        (33, 3, '', 'LLAVE A', '1er. 1º', '4to. 2º'),
        (34, 3, '', 'LLAVE A', '1er. 2º', '4to. 1º'),
        (35, 3, '', 'LLAVE A', '3er. 1º', '2do. 2º'),
        (36, 3, '', 'LLAVE A', '3er. 2º', '2do. 1º'),

        # Día 4 — LLAVE B
        (41, 4, '', 'LLAVE B', 'BYE',     'PP30'),
        (42, 4, '', 'LLAVE B', 'PP31',    'BYE'),
        (43, 4, '', 'LLAVE B', '1er. 3º', 'GP30'),
        (44, 4, '', 'LLAVE B', 'GP31',    'PP32'),

        # Día 4 — LLAVE A
        (45, 4, '', 'LLAVE A', 'PP33', 'PP34'),
        (46, 4, '', 'LLAVE A', 'PP35', 'PP36'),
        (47, 4, '', 'LLAVE A', 'GP33', 'GP34'),
        (48, 4, '', 'LLAVE A', 'GP35', 'GP36'),

        # Día 5 — Puestos
        (54, 5, '', '13º - 14º', 'PP30', 'PP31'),
        (55, 5, '', '11º - 12º', 'PP43', 'PP44'),
        (56, 5, '', '9º - 10º',  'GP43', 'GP44'),
        (57, 5, '', '7º - 8º',   'PP45', 'PP46'),
        (58, 5, '', '5º - 6º',   'GP45', 'GP46'),
        (59, 5, '', '3º - 4º',   'PP47', 'PP48'),
        (60, 5, '', '1º - 2º',   'GP47', 'GP48'),
    ]

    def elim_round_for_number(n: int) -> int:
        if n <= 24:
            return 1
        if n <= 36:
            return 2
        if n <= 48:
            return 3
        return 4

    for n, day, field, zone, h, a in elim_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        is_bye = (hh.upper() == 'BYE' or aa.upper() == 'BYE')

        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h,
            'away': a,
            'round': elim_round_for_number(n),
            '_is_bye': is_bye,
        })

    return matches

def generate_21_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 21 equipos en sistema 4x6 según el PDF 4X6_muestra_gpt_21_EQ.pdf.

    Zonas (según PDF):
      ZONA 1: 1,2,3,4,5,6
      ZONA 2: 7,8,9,10,11
      ZONA 3: 13,14,15,16,17
      ZONA 4: 19,20,21,22,23
    (No existen semillas 12 ni 18: se “saltean”)

    Devuelve dicts con:
      number, day, field, zone, home, away, round, _is_bye
    """
    if len(teams) != 21:
        raise ValueError("Este fixture está definido sólo para 21 equipos (4x6).")

    # Mapear semillas -> equipos (con saltos 12 y 18)
    seed_order = [1, 2, 3, 4, 5, 6,
                  7, 8, 9, 10, 11,
                  13, 14, 15, 16, 17,
                  19, 20, 21, 22, 23]

    seed_to_name = {seed: teams[i].name for i, seed in enumerate(seed_order)}

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    matches: List[Dict[str, Any]] = []

    def add(num: int, day: int, zone: str, home: str, away: str, rnd: int, is_bye: bool = False):
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": home,
            "away": away,
            "round": rnd,
            "_is_bye": bool(is_bye),
        })

    # -------------------------
    # FASE REGULAR (según PDF)
    # -------------------------

    # Ronda 1 (Día 1)
    add(1,  1, "1", seed_name(1),  seed_name(2),  1)
    add(2,  1, "1", seed_name(6),  seed_name(3),  1)
    add(3,  1, "1", seed_name(5),  seed_name(4),  1)
    add(4,  1, "2", seed_name(7),  seed_name(8),  1)
    add(6,  1, "2", seed_name(11), seed_name(10), 1)
    add(7,  1, "3", seed_name(13), seed_name(14), 1)
    add(9,  1, "3", seed_name(17), seed_name(16), 1)
    add(10, 1, "4", seed_name(19), seed_name(20), 1)
    add(12, 1, "4", seed_name(23), seed_name(22), 1)

    # Ronda 2 (Día 1)
    add(13, 1, "1", seed_name(1),  seed_name(6),  2)
    add(14, 1, "1", seed_name(5),  seed_name(2),  2)
    add(15, 1, "1", seed_name(4),  seed_name(3),  2)
    add(17, 1, "2", seed_name(11), seed_name(8),  2)
    add(18, 1, "2", seed_name(10), seed_name(9),  2)
    add(20, 1, "3", seed_name(17), seed_name(14), 2)
    add(21, 1, "3", seed_name(16), seed_name(15), 2)
    add(23, 1, "4", seed_name(23), seed_name(20), 2)
    add(24, 1, "4", seed_name(22), seed_name(21), 2)

    # Ronda 3 (Día 2)
    add(25, 2, "1", seed_name(1),  seed_name(5),  3)
    add(26, 2, "1", seed_name(4),  seed_name(6),  3)
    add(27, 2, "1", seed_name(3),  seed_name(2),  3)
    add(28, 2, "2", seed_name(7),  seed_name(11), 3)
    add(30, 2, "2", seed_name(9),  seed_name(8),  3)
    add(31, 2, "3", seed_name(13), seed_name(17), 3)
    add(33, 2, "3", seed_name(15), seed_name(14), 3)
    add(34, 2, "4", seed_name(19), seed_name(23), 3)
    add(36, 2, "4", seed_name(21), seed_name(20), 3)

    # Ronda 4 (Día 2)
    add(37, 2, "1", seed_name(1),  seed_name(4),  4)
    add(38, 2, "1", seed_name(3),  seed_name(5),  4)
    add(39, 2, "1", seed_name(2),  seed_name(6),  4)
    add(40, 2, "2", seed_name(7),  seed_name(10), 4)
    add(41, 2, "2", seed_name(9),  seed_name(11), 4)
    add(43, 2, "3", seed_name(13), seed_name(16), 4)
    add(44, 2, "3", seed_name(15), seed_name(17), 4)
    add(46, 2, "4", seed_name(19), seed_name(22), 4)
    add(47, 2, "4", seed_name(21), seed_name(23), 4)

    # Ronda 5 (Día 3)
    add(49, 3, "1", seed_name(1),  seed_name(3),  5)
    add(50, 3, "1", seed_name(2),  seed_name(4),  5)
    add(51, 3, "1", seed_name(6),  seed_name(5),  5)
    add(52, 3, "2", seed_name(7),  seed_name(9),  5)
    add(53, 3, "2", seed_name(8),  seed_name(10), 5)
    add(55, 3, "3", seed_name(13), seed_name(15), 5)
    add(56, 3, "3", seed_name(14), seed_name(16), 5)
    add(58, 3, "4", seed_name(19), seed_name(21), 5)
    add(59, 3, "4", seed_name(20), seed_name(22), 5)

    # -------------------------
    # FASE FINAL (según PDF)
    # -------------------------

    # Día 4 (63–72)
    add(63, 4, "LLAVE E", "5to. Z1", "5to. Z3", 1)
    add(64, 4, "LLAVE E", "5to. Z2", "5to. Z4", 1)
    add(65, 4, "LLAVE D", "4to. Z1", "4to. Z3", 1)
    add(66, 4, "LLAVE D", "4to. Z2", "4to. Z4", 1)
    add(67, 4, "LLAVE C", "3ro. Z1", "3ro. Z3", 1)
    add(68, 4, "LLAVE C", "3ro. Z2", "3ro. Z4", 1)
    add(69, 4, "LLAVE B", "2do. Z1", "2do. Z3", 1)
    add(70, 4, "LLAVE B", "2do. Z2", "2do. Z4", 1)
    add(71, 4, "LLAVE A", "1ro. Z1", "1ro. Z3", 1)
    add(72, 4, "LLAVE A", "1ro. Z2", "1ro. Z4", 1)

    # Partido informativo (74): 21º = 6to. Z1 (sin rival) -> tratar como BYE
    add(74, 5, "21º", "6to. Z1", "", 2, is_bye=True)

    # Día 5 (75–84)
    add(75, 5, "19º - 20º", "PP63", "PP64", 2)
    add(76, 5, "17º - 18º", "GP63", "GP64", 2)
    add(77, 5, "15º - 16º", "PP65", "PP66", 2)
    add(78, 5, "13º - 14º", "GP65", "GP66", 2)
    add(79, 5, "11º - 12º", "PP67", "PP68", 2)
    add(80, 5, "9º - 10º",  "GP67", "GP68", 2)
    add(81, 5, "7º - 8º",   "PP69", "PP70", 2)
    add(82, 5, "5º - 6º",   "GP69", "GP70", 2)
    add(83, 5, "3º - 4º",   "PP71", "PP72", 2)
    add(84, 5, "1º - 2º",   "GP71", "GP72", 2)

    return matches

def generate_20_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 20 equipos en sistema 4x6 según PDF 4X6_muestra_gpt_20_EQ.pdf.

    ZONAS (según PDF):
      Z1: 1,2,3,4,5
      Z2: 7,8,9,10,11
      Z3: 13,14,15,16,17
      Z4: 19,20,21,22,23
    (El PDF “saltea” 6, 12 y 18; se usan seeds con huecos)
    """
    if len(teams) != 20:
        raise ValueError("Este fixture está definido sólo para 20 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 20 equipos reales a seeds del PDF (con huecos 6,12,18)
    seed_slots = [1, 2, 3, 4, 5,
                  7, 8, 9, 10, 11,
                  13, 14, 15, 16, 17,
                  19, 20, 21, 22, 23]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    # -------------------------
    # FASE REGULAR (1–60 con huecos) — usar SOLO los que existen en el PDF
    # Formato: (Nro, Día, Zona, SeedLocal, SeedVisitante, Ronda)
    # -------------------------
    regular_specs = [
        # Ronda 1 (Día 1)
        (1,  1, '1',  1,  2, 1),
        (3,  1, '1',  5,  4, 1),
        (4,  1, '2',  7,  8, 1),
        (6,  1, '2', 11, 10, 1),
        (7,  1, '3', 13, 14, 1),
        (9,  1, '3', 17, 16, 1),
        (10, 1, '4', 19, 20, 1),
        (12, 1, '4', 23, 22, 1),

        # Ronda 2 (Día 1)
        (14, 1, '1',  5,  2, 2),
        (15, 1, '1',  4,  3, 2),
        (17, 1, '2', 11,  8, 2),
        (18, 1, '2', 10,  9, 2),
        (20, 1, '3', 17, 14, 2),
        (21, 1, '3', 16, 15, 2),
        (23, 1, '4', 23, 20, 2),
        (24, 1, '4', 22, 21, 2),

        # Ronda 3 (Día 2)
        (25, 2, '1',  1,  5, 3),
        (27, 2, '1',  3,  2, 3),
        (28, 2, '2',  7, 11, 3),
        (30, 2, '2',  9,  8, 3),
        (31, 2, '3', 13, 17, 3),
        (33, 2, '3', 15, 14, 3),
        (34, 2, '4', 19, 23, 3),
        (36, 2, '4', 21, 20, 3),

        # Ronda 4 (Día 2)
        (37, 2, '1',  1,  4, 4),
        (38, 2, '1',  3,  5, 4),
        (40, 2, '2',  7, 10, 4),
        (41, 2, '2',  9, 11, 4),
        (43, 2, '3', 13, 16, 4),
        (44, 2, '3', 15, 17, 4),
        (46, 2, '4', 19, 22, 4),
        (47, 2, '4', 21, 23, 4),

        # Ronda 5 (Día 3)
        (49, 3, '1',  1,  3, 5),
        (50, 3, '1',  2,  4, 5),
        (52, 3, '2',  7,  9, 5),
        (53, 3, '2',  8, 10, 5),
        (55, 3, '3', 13, 15, 5),
        (56, 3, '3', 14, 16, 5),
        (58, 3, '4', 19, 21, 5),
        (59, 3, '4', 20, 22, 5),
    ]

    for (num, day, zone, sh, sa, rnd) in regular_specs:
        matches.append({
            "number": num,
            "day": day,
            "field": "",          # NO fijamos cancha: la grilla/auto-ubicar lo gestiona
            "zone": zone,
            "home": seed_name(sh),
            "away": seed_name(sa),
            "round": rnd,
            "_is_bye": False,
        })

    # -------------------------
    # FASE FINAL (63–72 día 4, 75–84 día 5) — como PDF
    # OJO: 61,62,73,74 vacíos => NO se generan
    # -------------------------
    final_specs = [
        (63, 4, 'LLAVE E', '5to. Z1', '5to. Z3', 1),
        (64, 4, 'LLAVE E', '5to. Z2', '5to. Z4', 1),
        (65, 4, 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, 'LLAVE D', '4to. Z2', '4to. Z4', 1),
        (67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),
        (69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1),
        (71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),

        (75, 5, '19º - 20º', 'PP63', 'PP64', 2),
        (76, 5, '17º - 18º', 'GP63', 'GP64', 2),
        (77, 5, '15º - 16º', 'PP65', 'PP66', 2),
        (78, 5, '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, '9º - 10º',  'GP67', 'GP68', 2),
        (81, 5, '7º - 8º',   'PP69', 'PP70', 2),
        (82, 5, '5º - 6º',   'GP69', 'GP70', 2),
        (83, 5, '3º - 4º',   'PP71', 'PP72', 2),
        (84, 5, '1º - 2º',   'GP71', 'GP72', 2),
    ]

    for (num, day, zone, h, a, rnd) in final_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": (hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    return matches

def generate_15_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Fixture EXACTO para 15 equipos en sistema 4x6 según PDF 4X6_muestra_gpt_15_EQ.pdf.

    ZONAS Y EQUIPOS (según PDF):
      Z1: 1,2,3,4
      Z2: 7,8,9,10
      Z3: 13,14,15,16
      Z4: 19,20,21
    (El PDF “saltea” 5,6,11,12,17,18,22,23,24; se usan seeds con huecos)

    Fase final:
      - Partido 66 es "4to. Z2 vs BYE" (se trata como BYE)
      - Partido 77 es informativo: "15º PP65" (sin rival -> se trata como BYE/informativo)
    """
    if len(teams) != 15:
        raise ValueError("Este fixture está definido sólo para 15 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 15 equipos reales a seeds del PDF (con huecos)
    seed_slots = [
        1, 2, 3, 4,
        7, 8, 9, 10,
        13, 14, 15, 16,
        19, 20, 21
    ]

    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    # -------------------------
    # FASE REGULAR — usar SOLO los que existen en el PDF
    # Formato: (Nro, Día, Zona, SeedLocal, SeedVisitante, Ronda)
    # -------------------------
    regular_specs = [
        # Ronda 1 (Día 1)
        ( 1, 1, '1',  1,  2, 1),
        ( 4, 1, '2',  7,  8, 1),
        ( 7, 1, '3', 13, 14, 1),
        (10, 1, '4', 19, 20, 1),

        # Ronda 2 (Día 1)
        (15, 1, '1',  4,  3, 2),
        (18, 1, '2', 10,  9, 2),
        (21, 1, '3', 16, 15, 2),

        # Ronda 3 (Día 2)
        (27, 2, '1',  3,  2, 3),
        (30, 2, '2',  9,  8, 3),
        (33, 2, '3', 15, 14, 3),
        (36, 2, '4', 21, 20, 3),

        # Ronda 4 (Día 2)
        (37, 2, '1',  1,  4, 4),
        (40, 2, '2',  7, 10, 4),
        (43, 2, '3', 13, 16, 4),

        # Ronda 5 (Día 3)
        (49, 3, '1',  1,  3, 5),
        (50, 3, '1',  2,  4, 5),
        (52, 3, '2',  7,  9, 5),
        (53, 3, '2',  8, 10, 5),
        (55, 3, '3', 13, 15, 5),
        (56, 3, '3', 14, 16, 5),
        (58, 3, '4', 19, 21, 5),
    ]

    for (num, day, zone, sh, sa, rnd) in regular_specs:
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": seed_name(sh),
            "away": seed_name(sa),
            "round": rnd,
            "_is_bye": False,
        })

    # -------------------------
    # FASE FINAL — EXACTA PDF
    # OJO: 61–64 y 73–76 NO se generan (vacíos en el PDF)
    # -------------------------
    final_specs = [
        (65, 4, 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, 'LLAVE D', '4to. Z2', 'BYE',     1),
        (67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),
        (69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1),
        (71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),

        # ✅ Informativo (sin rival): "15º PP65" -> tratar como BYE/informativo
        # Lo asociamos al Día 5 para que caiga en el BYE del día correspondiente.
        (77, 5, '15º', 'PP65', '', 2),

        (78, 5, '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, '9º - 10º',  'GP67', 'GP68', 2),
        (81, 5, '7º - 8º',   'PP69', 'PP70', 2),
        (82, 5, '5º - 6º',   'GP69', 'GP70', 2),
        (83, 5, '3º - 4º',   'PP71', 'PP72', 2),
        (84, 5, '1º - 2º',   'GP71', 'GP72', 2),
    ]

    for (num, day, zone, h, a, rnd) in final_specs:
        hh = str(h).strip()
        aa = str(a).strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": (hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    return matches

def generate_18_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 18 equipos (según PDF 4X6_muestra_gpt_18_EQ.pdf)

    ZONAS (según PDF, con seeds con huecos):
      Z1: 1,2,3,4,5
      Z2: 7,8,9,10
      Z3: 13,14,15,16,17
      Z4: 19,20,21,22

    El PDF “saltea” seeds (6,11,12,18,23,24, etc.). Para respetarlo,
    mapeamos los 18 equipos reales a estos seeds, en orden:
      [1,2,3,4,5, 7,8,9,10, 13,14,15,16,17, 19,20,21,22]

    NOTA:
      - 'field' se devuelve vacío para que el Auto-ubicar use canchas disponibles.
      - En fase regular 'zone' es "1","2","3","4".
      - En fase final 'zone' son textos: "LLAVE A".."LLAVE D" y "1º - 2º", etc.
    """
    if len(teams) != 18:
        raise ValueError("Este fixture está definido sólo para 18 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 18 equipos reales a seeds del PDF (con huecos)
    seed_slots = [
        1, 2, 3, 4, 5,
        7, 8, 9, 10,
        13, 14, 15, 16, 17,
        19, 20, 21, 22
    ]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(n: int, day: int, zone: str, h: Any, a: Any, rnd: int):
        hh = str(h or "").strip()
        aa = str(a or "").strip()
        matches.append({
            "number": n,
            "day": day,
            "field": "",          # vacío a propósito (auto-ubicar usa canchas disponibles)
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            # BYE real o “informativo” sin rival (away vacío)
            "_is_bye": (hh.upper() == "BYE" or aa.upper() == "BYE" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR (1–60 con huecos de numeración tal como el PDF)
    # Formato: (Nro, Día, Zona, SeedLocal, SeedVisitante, Ronda)
    # -------------------------
    regular_specs = [
        # Ronda 1 (Día 1)
        ( 1, 1, "1",  1,  2, 1),
        ( 3, 1, "1",  5,  4, 1),
        ( 4, 1, "2",  7,  8, 1),
        ( 7, 1, "3", 13, 14, 1),
        ( 9, 1, "3", 17, 16, 1),
        (10, 1, "4", 19, 20, 1),

        # Ronda 2 (Día 1)
        (14, 1, "1",  5,  2, 2),
        (15, 1, "1",  4,  3, 2),
        (18, 1, "2", 10,  9, 2),
        (20, 1, "3", 17, 14, 2),
        (21, 1, "3", 16, 15, 2),
        (24, 1, "4", 22, 21, 2),

        # Ronda 3 (Día 2)
        (25, 2, "1",  1,  5, 3),
        (27, 2, "1",  3,  2, 3),
        (30, 2, "2",  9,  8, 3),
        (31, 2, "3", 13, 17, 3),
        (33, 2, "3", 15, 14, 3),
        (36, 2, "4", 21, 20, 3),

        # Ronda 4 (Día 2)
        (37, 2, "1",  1,  4, 4),
        (38, 2, "1",  3,  5, 4),
        (40, 2, "2",  7, 10, 4),
        (43, 2, "3", 13, 16, 4),
        (44, 2, "3", 15, 17, 4),
        (46, 2, "4", 19, 22, 4),

        # Ronda 5 (Día 3)
        (49, 3, "1",  1,  3, 5),
        (50, 3, "1",  2,  4, 5),
        (52, 3, "2",  7,  9, 5),
        (53, 3, "2",  8, 10, 5),
        (55, 3, "3", 13, 15, 5),
        (56, 3, "3", 14, 16, 5),
        (58, 3, "4", 19, 21, 5),
        (59, 3, "4", 20, 22, 5),
    ]

    for n, day, zone, h, a, rnd in regular_specs:
        add(n, day, zone, seed_name(h), seed_name(a), rnd)

    # -------------------------
    # FASE FINAL (según PDF)
    # Día 4: 65–72 (LLAVES A–D; NO existe LLAVE E en 18 equipos)
    # Día 5: 76–84 (posiciones 17–18 y 1–16)
    # -------------------------

    # Día 4 — cruces
    # 65: LLAVE D (4to Z2 vs 4to Z4)
    # 66: LLAVE D (4to Z1 vs 4to Z3)
    # 67: LLAVE C (3ro Z2 vs 3ro Z4)
    # 68: LLAVE C (3ro Z1 vs 3ro Z3)
    # 69: LLAVE B (2do Z2 vs 2do Z4)
    # 70: LLAVE B (2do Z1 vs 2do Z3)
    # 71: LLAVE A (1ro Z2 vs 1ro Z4)
    # 72: LLAVE A (1ro Z1 vs 1ro Z3)
    add(65, 4, "LLAVE D", "4°Z2", "4°Z4", 6)
    add(66, 4, "LLAVE D", "4°Z1", "4°Z3", 6)
    add(67, 4, "LLAVE C", "3°Z2", "3°Z4", 6)
    add(68, 4, "LLAVE C", "3°Z1", "3°Z3", 6)
    add(69, 4, "LLAVE B", "2°Z2", "2°Z4", 6)
    add(70, 4, "LLAVE B", "2°Z1", "2°Z3", 6)
    add(71, 4, "LLAVE A", "1°Z2", "1°Z4", 6)
    add(72, 4, "LLAVE A", "1°Z1", "1°Z3", 6)

    # Día 5 — definiciones
    # En 18 equipos el PDF NO tiene 73–75 (quedan vacíos) y arranca en 76.
    add(76, 5, "17º - 18º", "5to. Z1", "5to. Z3", 7)
    add(77, 5, "15º - 16º", "PP65", "PP66", 7)
    add(78, 5, "13º - 14º", "GP65", "GP66", 7)
    add(79, 5, "11º - 12º", "PP67", "PP68", 7)
    add(80, 5, "9º - 10º",  "GP67", "GP68", 7)
    add(81, 5, "7º - 8º",   "PP69", "PP70", 7)
    add(82, 5, "5º - 6º",   "GP69", "GP70", 7)
    add(83, 5, "3º - 4º",   "PP71", "PP72", 7)
    add(84, 5, "1º - 2º",   "GP71", "GP72", 7)

    return matches

def generate_17_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 17 equipos (según PDF 4X6_muestra_gpt_17_EQ.pdf)

    ZONAS / seeds usados por el PDF:
      Z1: 1,2,3,4,5
      Z2: 7,8,9,10
      Z3: 13,14,15,16
      Z4: 19,20,21,22
    (Seeds NO usados: 6,11,12,17,18,23,24)

    Regular: Nros exactos del PDF (1..60 con huecos).
    Final: 65–72 (día 4) y 76 (informativo 17º) + 77–84 (día 5).
    """

    if len(teams) != 17:
        raise ValueError("Este fixture está definido sólo para 17 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 17 equipos reales a los seeds “con huecos” del PDF (en orden)
    seed_slots = [
        1, 2, 3, 4, 5,
        7, 8, 9, 10,
        13, 14, 15, 16,
        19, 20, 21, 22
    ]

    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(num: int, day: int, zone: str, home: str, away: str, rnd: int):
        hh = str(home or "").strip()
        aa = str(away or "").strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",          # auto-ubicar decide cancha
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": (hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR (exacto PDF)
    # Formato: (Nro, Día, Zona, SeedL, SeedV, Ronda)
    # -------------------------
    regular_specs = [
        ( 1, 1, '1',  1,  2, 1),
        ( 3, 1, '1',  5,  4, 1),
        ( 4, 1, '2',  7,  8, 1),
        ( 7, 1, '3', 13, 14, 1),
        (10, 1, '4', 19, 20, 1),

        (14, 1, '1',  5,  2, 2),
        (15, 1, '1',  4,  3, 2),
        (18, 1, '2', 10,  9, 2),
        (21, 1, '3', 16, 15, 2),
        (24, 1, '4', 22, 21, 2),

        (25, 2, '1',  1,  5, 3),
        (27, 2, '1',  3,  2, 3),
        (30, 2, '2',  9,  8, 3),
        (33, 2, '3', 15, 14, 3),
        (36, 2, '4', 21, 20, 3),

        (37, 2, '1',  1,  4, 4),
        (38, 2, '1',  3,  5, 4),
        (40, 2, '2',  7, 10, 4),
        (43, 2, '3', 13, 16, 4),
        (46, 2, '4', 19, 22, 4),

        (49, 3, '1',  1,  3, 5),
        (50, 3, '1',  2,  4, 5),
        (52, 3, '2',  7,  9, 5),
        (53, 3, '2',  8, 10, 5),
        (55, 3, '3', 13, 15, 5),
        (56, 3, '3', 14, 16, 5),
        (58, 3, '4', 19, 21, 5),
        (59, 3, '4', 20, 22, 5),
    ]

    for (num, day, zone, hseed, aseed, rnd) in regular_specs:
        add(num, day, zone, seed_name(hseed), seed_name(aseed), rnd)

    # -------------------------
    # FASE FINAL (exacto PDF)
    # OJO: 61–64 y 73–75 vacíos => NO se generan
    # -------------------------
    final_specs = [
        (65, 4, 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, 'LLAVE D', '4to. Z2', '4to. Z4', 1),
        (67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),
        (69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1),
        (71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),

        # ✅ Informativo: “17º … 5to. Z1” (sin rival) -> tratar como BYE
        (76, 5, '17º', '5to. Z1', '', 2),

        (77, 5, '15º - 16º', 'PP65', 'PP66', 2),
        (78, 5, '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, '9º - 10º',  'GP67', 'GP68', 2),
        (81, 5, '7º - 8º',   'PP69', 'PP70', 2),
        (82, 5, '5º - 6º',   'GP69', 'GP70', 2),
        (83, 5, '3º - 4º',   'PP71', 'PP72', 2),
        (84, 5, '1º - 2º',   'GP71', 'GP72', 2),
    ]

    for (num, day, zone, h, a, rnd) in final_specs:
        add(num, day, zone, h, a, rnd)

    return matches

def generate_16_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 16 equipos (según PDF 4X6_muestra_gpt_16_EQ.pdf)

    ZONAS (según PDF):
      Z1: 1,2,3,4
      Z2: 7,8,9,10
      Z3: 13,14,15,16
      Z4: 19,20,21,22
    (El PDF “saltea” 5,6,11,12,17,18,23,24; se usan seeds con huecos)

    Nota:
      - 'field' se devuelve vacío para que el Auto-ubicar use canchas disponibles.
      - 'zone' es "1","2","3","4" para fase regular (así el frontend la trata como regular).
      - En fase final, 'zone' son textos (LLAVE A..D, y "1º - 2º", etc.)
      - 61–64 y 73–76 quedan vacíos en el PDF ⇒ NO se generan.
    """
    if len(teams) != 16:
        raise ValueError("Este fixture está definido sólo para 16 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 16 equipos reales a seeds del PDF (con huecos)
    seed_slots = [1, 2, 3, 4,
                  7, 8, 9, 10,
                  13, 14, 15, 16,
                  19, 20, 21, 22]

    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(num: int, day: int, zone: str, home, away, rnd: int, is_bye: bool = False) -> None:
        # home/away pueden ser seed(int) o texto (placeholders tipo "PP65")
        hh = seed_name(home) if isinstance(home, int) else str(home).strip()
        aa = seed_name(away) if isinstance(away, int) else str(away).strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": bool(is_bye) or (hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR — EXACTO del PDF
    # (nro, día, zona, equipoL, equipoV, ronda)
    # -------------------------
    regular_specs = [
        # Día 1
        (1,  1, "1",  1,  2, 1),
        (4,  1, "2",  7,  8, 1),
        (7,  1, "3", 13, 14, 1),
        (10, 1, "4", 19, 20, 1),

        (15, 1, "1",  4,  3, 2),
        (18, 1, "2", 10,  9, 2),
        (21, 1, "3", 16, 15, 2),
        (24, 1, "4", 22, 21, 2),

        # Día 2
        (27, 2, "1",  3,  2, 3),
        (30, 2, "2",  9,  8, 3),
        (33, 2, "3", 15, 14, 3),
        (36, 2, "4", 21, 20, 3),

        (37, 2, "1",  1,  4, 4),
        (40, 2, "2",  7, 10, 4),
        (43, 2, "3", 13, 16, 4),
        (46, 2, "4", 19, 22, 4),

        # Día 3
        (49, 3, "1",  1,  3, 5),
        (50, 3, "1",  2,  4, 5),
        (52, 3, "2",  7,  9, 5),
        (53, 3, "2",  8, 10, 5),
        (55, 3, "3", 13, 15, 5),
        (56, 3, "3", 14, 16, 5),
        (58, 3, "4", 19, 21, 5),
        (59, 3, "4", 20, 22, 5),
    ]

    for (num, day, zone, h, a, rnd) in regular_specs:
        add(num, day, zone, h, a, rnd)

    # -------------------------
    # FASE FINAL (día 4 y 5) — EXACTO del PDF
    # (65–72 día 4, 77–84 día 5)
    # -------------------------
    final_specs = [
        # Día 4
        (65, 4, "LLAVE D", "4to. Z1", "4to. Z3", 1),
        (66, 4, "LLAVE D", "4to. Z2", "4to. Z4", 1),
        (67, 4, "LLAVE C", "3ro. Z1", "3ro. Z3", 1),
        (68, 4, "LLAVE C", "3ro. Z2", "3ro. Z4", 1),
        (69, 4, "LLAVE B", "2do. Z1", "2do. Z3", 1),
        (70, 4, "LLAVE B", "2do. Z2", "2do. Z4", 1),
        (71, 4, "LLAVE A", "1ro. Z1", "1ro. Z3", 1),
        (72, 4, "LLAVE A", "1ro. Z2", "1ro. Z4", 1),

        # Día 5
        (77, 5, "15º - 16º", "PP65", "PP66", 2),
        (78, 5, "13º - 14º", "GP65", "GP66", 2),
        (79, 5, "11º - 12º", "PP67", "PP68", 2),
        (80, 5, "9º - 10º",  "GP67", "GP68", 2),
        (81, 5, "7º - 8º",   "PP69", "PP70", 2),
        (82, 5, "5º - 6º",   "GP69", "GP70", 2),
        (83, 5, "3º - 4º",   "PP71", "PP72", 2),
        (84, 5, "1º - 2º",   "GP71", "GP72", 2),
    ]

    for (num, day, zone, h, a, rnd) in final_specs:
        add(num, day, zone, h, a, rnd)

    return matches

def generate_15_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 15 equipos (según PDF 4X6_muestra_gpt_15_EQ.pdf)
    """
    if len(teams) != 15:
        raise ValueError("Este fixture está definido sólo para 15 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 15 equipos reales a seeds del PDF (con huecos)
    seed_slots = [1, 2, 3, 4, 7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(num: int, day: int, zone: str, home: str, away: str, rnd: int, is_bye: bool = False) -> None:
        hh = str(home or '').strip()
        aa = str(away or '').strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": bool(is_bye or hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR (según PDF)
    # -------------------------
    add(1, 1, '1', seed_name(1), seed_name(2), 1)
    add(4, 1, '2', seed_name(7), seed_name(8), 1)
    add(7, 1, '3', seed_name(13), seed_name(14), 1)
    add(10, 1, '4', seed_name(19), seed_name(20), 1)
    add(15, 1, '1', seed_name(4), seed_name(3), 2)
    add(18, 1, '2', seed_name(10), seed_name(9), 2)
    add(21, 1, '3', seed_name(16), seed_name(15), 2)
    add(27, 2, '1', seed_name(3), seed_name(2), 3)
    add(30, 2, '2', seed_name(9), seed_name(8), 3)
    add(33, 2, '3', seed_name(15), seed_name(14), 3)
    add(36, 2, '4', seed_name(21), seed_name(20), 3)
    add(37, 2, '1', seed_name(1), seed_name(4), 4)
    add(40, 2, '2', seed_name(7), seed_name(10), 4)
    add(43, 2, '3', seed_name(13), seed_name(16), 4)
    add(49, 3, '1', seed_name(1), seed_name(3), 5)
    add(50, 3, '1', seed_name(2), seed_name(4), 5)
    add(52, 3, '2', seed_name(7), seed_name(9), 5)
    add(53, 3, '2', seed_name(8), seed_name(10), 5)
    add(55, 3, '3', seed_name(13), seed_name(15), 5)
    add(56, 3, '3', seed_name(14), seed_name(16), 5)
    add(58, 3, '4', seed_name(19), seed_name(21), 5)

    # -------------------------
    # FASE FINAL (según PDF)
    # -------------------------
    add(65, 4, 'LLAVE D', '4to. Z1', '4to. Z3', 1)
    add(66, 4, 'LLAVE D', '4to. Z2', 'BYE', 1, is_bye=True)
    add(67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1)
    add(68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1)
    add(69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1)
    add(70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1)
    add(71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1)
    add(72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1)
    add(77, 5, '15º', 'PP65', '', 2, is_bye=True)
    add(78, 5, '13º - 14º', 'GP65', 'GP66', 2)
    add(79, 5, '11º - 12º', 'PP67', 'PP68', 2)
    add(80, 5, '9º - 10º', 'GP67', 'GP68', 2)
    add(81, 5, '7º - 8º', 'PP69', 'PP70', 2)
    add(82, 5, '5º - 6º', 'GP69', 'GP70', 2)
    add(83, 5, '3º - 4º', 'PP71', 'PP72', 2)
    add(84, 5, '1º - 2º', 'GP71', 'GP72', 2)

    return matches

def generate_14_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 14 equipos (según PDF 4X6_muestra_gpt_14_EQ.pdf)
    """
    if len(teams) != 14:
        raise ValueError("Este fixture está definido sólo para 14 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 14 equipos reales a seeds del PDF (con huecos)
    seed_slots = [1, 2, 3, 4, 7, 8, 9, 10, 13, 14, 15, 16, 19, 20, 21]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(num: int, day: int, zone: str, home: str, away: str, rnd: int, is_bye: bool = False) -> None:
        hh = str(home or '').strip()
        aa = str(away or '').strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": bool(is_bye or hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR (según PDF)
    # -------------------------
    add(1, 1, '1', seed_name(1), seed_name(2), 1)
    add(4, 1, '2', seed_name(7), seed_name(8), 1)
    add(7, 1, '3', seed_name(13), seed_name(14), 1)
    add(10, 1, '4', seed_name(19), seed_name(20), 1)
    add(15, 1, '1', seed_name(4), seed_name(3), 2)
    add(18, 1, '2', seed_name(10), seed_name(9), 2)
    add(21, 1, '3', seed_name(16), seed_name(15), 2)
    add(27, 2, '1', seed_name(3), seed_name(2), 3)
    add(30, 2, '2', seed_name(9), seed_name(8), 3)
    add(33, 2, '3', seed_name(15), seed_name(14), 3)
    add(37, 2, '1', seed_name(1), seed_name(4), 4)
    add(40, 2, '2', seed_name(7), seed_name(10), 4)
    add(43, 2, '3', seed_name(13), seed_name(16), 4)
    add(49, 3, '1', seed_name(1), seed_name(3), 5)
    add(50, 3, '1', seed_name(2), seed_name(4), 5)
    add(52, 3, '2', seed_name(7), seed_name(9), 5)
    add(53, 3, '2', seed_name(8), seed_name(10), 5)
    add(55, 3, '3', seed_name(13), seed_name(15), 5)
    add(56, 3, '3', seed_name(14), seed_name(16), 5)
    
    # -------------------------
    # FASE FINAL (según PDF)
    # -------------------------
    add(67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1)
    add(68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1)
    add(69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1)
    add(70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1)
    add(71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1)
    add(72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1)
    add(78, 5, '13º - 14º', '4to. Z1', '4to. Z3', 2)
    add(79, 5, '11º - 12º', 'PP67', 'PP68', 2)
    add(80, 5, '9º - 10º', 'GP67', 'GP68', 2)
    add(81, 5, '7º - 8º', 'PP69', 'PP70', 2)
    add(82, 5, '5º - 6º', 'GP69', 'GP70', 2)
    add(83, 5, '3º - 4º', 'PP71', 'PP72', 2)
    add(84, 5, '1º - 2º', 'GP71', 'GP72', 2)

    return matches

def generate_13_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 13 equipos (según PDF 4X6_muestra_gpt_13_EQ.pdf)
    """
    if len(teams) != 13:
        raise ValueError("Este fixture está definido sólo para 13 equipos (4x6).")

    matches: List[Dict[str, Any]] = []

    # Mapear 13 equipos reales a seeds del PDF (con huecos)
    seed_slots = [1, 2, 3, 4, 7, 8, 9, 13, 14, 15, 19, 20, 21]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        seed_to_name[seed_slots[i]] = t.name

    def seed_name(seed: int) -> str:
        return seed_to_name.get(seed, f"Equipo {seed}")

    def add(num: int, day: int, zone: str, home: str, away: str, rnd: int, is_bye: bool = False) -> None:
        hh = str(home or '').strip()
        aa = str(away or '').strip()
        matches.append({
            "number": num,
            "day": day,
            "field": "",
            "zone": zone,
            "home": hh,
            "away": aa,
            "round": rnd,
            "_is_bye": bool(is_bye or hh.upper() == "BYE" or aa.upper() == "BYE" or hh == "" or aa == ""),
        })

    # -------------------------
    # FASE REGULAR (según PDF)
    # -------------------------
    add(1, 1, '1', seed_name(1), seed_name(2), 1)
    add(4, 1, '2', seed_name(7), seed_name(8), 1)
    add(7, 1, '3', seed_name(13), seed_name(14), 1)
    add(10, 1, '4', seed_name(19), seed_name(20), 1)
    add(15, 1, '1', seed_name(4), seed_name(3), 2)
    add(27, 2, '1', seed_name(3), seed_name(2), 3)
    add(30, 2, '2', seed_name(9), seed_name(8), 3)
    add(33, 2, '3', seed_name(15), seed_name(14), 3)
    add(36, 2, '4', seed_name(21), seed_name(20), 3)
    add(37, 2, '1', seed_name(1), seed_name(4), 4)
    add(49, 3, '1', seed_name(1), seed_name(3), 5)
    add(50, 3, '1', seed_name(2), seed_name(4), 5)
    add(52, 3, '2', seed_name(7), seed_name(9), 5)
    add(55, 3, '3', seed_name(13), seed_name(15), 5)
    add(58, 3, '4', seed_name(19), seed_name(21), 5)

    # -------------------------
    # FASE FINAL (según PDF)
    # -------------------------
    add(67, 4, 'LLAVE C', '3ro. Z1', '3ro. Z3', 1)
    add(68, 4, 'LLAVE C', '3ro. Z2', '3ro. Z4', 1)
    add(69, 4, 'LLAVE B', '2do. Z1', '2do. Z3', 1)
    add(70, 4, 'LLAVE B', '2do. Z2', '2do. Z4', 1)
    add(71, 4, 'LLAVE A', '1ro. Z1', '1ro. Z3', 1)
    add(72, 4, 'LLAVE A', '1ro. Z2', '1ro. Z4', 1)
    add(78, 5, '13º', '4to. Z1', '', 2, is_bye=True)
    add(79, 5, '11º - 12º', 'PP67', 'PP68', 2)
    add(80, 5, '9º - 10º', 'GP67', 'GP68', 2)
    add(81, 5, '7º - 8º', 'PP69', 'PP70', 2)
    add(82, 5, '5º - 6º', 'GP69', 'GP70', 2)
    add(83, 5, '3º - 4º', 'PP71', 'PP72', 2)
    add(84, 5, '1º - 2º', 'GP71', 'GP72', 2)

    return matches

def generate_19_team_full_tournament_4x6(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    4x6 — 19 equipos (según PDF 4X6_muestra_gpt_19_EQ.pdf)
    - Z1: seeds 1,2,3,4,5
    - Z2: seeds 7,8,9,10,11
    - Z3: seeds 13,14,15,16,17
    - Z4: seeds 19,20,21,22 (faltan seeds 23/24 y otros; se respeta el PDF)
    - Incluye fase final 63–84 con:
        * Nº64 con BYE
        * Nº75 informativo "19º PP63" (sin hora/cancha)
    """

    matches: List[Dict[str, Any]] = []

    # En este modelo hay "huecos" de seeds (6,12,18,23,24 no están en 19 equipos).
    # Mapeamos los 19 equipos reales a estos seeds, en orden.
    seed_slots = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 19, 20, 21, 22]
    seed_to_name: Dict[int, str] = {}
    for i, t in enumerate(teams):
        if i < len(seed_slots):
            seed_to_name[seed_slots[i]] = t.name

    def seed_name(n: int) -> str:
        return seed_to_name.get(n, f"Equipo {n}")

    # =========================
    # FASE REGULAR (1–60, con números faltantes tal como en el PDF)
    # Formato: (Nro, Día, Cancha, Zona, SeedLocal, SeedVisitante, Ronda)
    # =========================
    regular_specs = [
        # Ronda 1
        (1,  1, 'C1', '1',  1,  2, 1),
        (3,  1, 'C1', '1',  5,  4, 1),
        (4,  1, 'C2', '2',  7,  8, 1),
        (6,  1, 'C2', '2', 11, 10, 1),
        (7,  1, 'C1', '3', 13, 14, 1),
        (9,  1, 'C1', '3', 17, 16, 1),
        (10, 1, 'C2', '4', 19, 20, 1),

        # Ronda 2
        (14, 1, 'C2', '1',  5,  2, 2),
        (15, 1, 'C1', '1',  4,  3, 2),
        (17, 1, 'C1', '2', 11,  8, 2),
        (18, 1, 'C2', '2', 10,  9, 2),
        (20, 1, 'C2', '3', 17, 14, 2),
        (21, 1, 'C1', '3', 16, 15, 2),
        (24, 1, 'C2', '4', 22, 21, 2),

        # Ronda 3 (Día 2)
        (25, 2, 'C1', '1',  1,  5, 3),
        (27, 2, 'C1', '1',  3,  2, 3),
        (28, 2, 'C2', '2',  7, 11, 3),
        (30, 2, 'C2', '2',  9,  8, 3),
        (31, 2, 'C1', '3', 13, 17, 3),
        (33, 2, 'C1', '3', 15, 14, 3),
        (36, 2, 'C2', '4', 21, 20, 3),

        # Ronda 4 (Día 2)
        (37, 2, 'C1', '1',  1,  4, 4),
        (38, 2, 'C2', '1',  3,  5, 4),
        (40, 2, 'C2', '2',  7, 10, 4),
        (41, 2, 'C1', '2',  9, 11, 4),
        (43, 2, 'C1', '3', 13, 16, 4),
        (44, 2, 'C2', '3', 15, 17, 4),
        (46, 2, 'C2', '4', 19, 22, 4),

        # Ronda 5 (Día 3)
        (49, 3, 'C1', '1',  1,  3, 5),
        (50, 3, 'C2', '1',  2,  4, 5),
        (52, 3, 'C2', '2',  7,  9, 5),
        (53, 3, 'C1', '2',  8, 10, 5),
        (55, 3, 'C1', '3', 13, 15, 5),
        (56, 3, 'C2', '3', 14, 16, 5),
        (58, 3, 'C2', '4', 19, 21, 5),
        (59, 3, 'C1', '4', 20, 22, 5),
    ]

    for n, day, field, zone, hs, as_, rnd in regular_specs:
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': seed_name(hs),
            'away': seed_name(as_),
            'round': rnd,
            '_is_bye': False,
        })

    # =========================
    # FASE FINAL (63–84; con 73/74 vacíos y 75 informativo)
    # Formato: (Nro, Día, Cancha, Zona, Local, Visitante, Ronda)
    # =========================
    final_specs = [
        (63, 4, 'C1', 'LLAVE E', '5to. Z1', '5to. Z3', 1),
        (64, 4, 'C2', 'LLAVE E', '5to. Z2', 'BYE',     1),

        (65, 4, 'C1', 'LLAVE D', '4to. Z1', '4to. Z3', 1),
        (66, 4, 'C2', 'LLAVE D', '4to. Z2', '4to. Z4', 1),

        (67, 4, 'C1', 'LLAVE C', '3ro. Z1', '3ro. Z3', 1),
        (68, 4, 'C2', 'LLAVE C', '3ro. Z2', '3ro. Z4', 1),

        (69, 4, 'C1', 'LLAVE B', '2do. Z1', '2do. Z3', 1),
        (70, 4, 'C2', 'LLAVE B', '2do. Z2', '2do. Z4', 1),

        (71, 4, 'C1', 'LLAVE A', '1ro. Z1', '1ro. Z3', 1),
        (72, 4, 'C2', 'LLAVE A', '1ro. Z2', '1ro. Z4', 1),

        # 73 y 74 NO existen en el PDF (vacíos)

        # 75 informativo: "19º PP63" → sin hora/cancha y NO auto-ubicar
        # Lo representamos como: zone="19º", home="PP63", away=""
        (75, 5, '',   '19º',      'PP63',   '',        2),

        (76, 5, 'C2', '17º - 18º', 'GP63', 'GP64', 2),
        (77, 5, 'C1', '15º - 16º', 'PP65', 'PP66', 2),
        (78, 5, 'C2', '13º - 14º', 'GP65', 'GP66', 2),
        (79, 5, 'C1', '11º - 12º', 'PP67', 'PP68', 2),
        (80, 5, 'C2', '9º - 10º',  'GP67', 'GP68', 2),
        (81, 5, 'C1', '7º - 8º',   'PP69', 'PP70', 2),
        (82, 5, 'C2', '5º - 6º',   'GP69', 'GP70', 2),
        (83, 5, 'C1', '3º - 4º',   'PP71', 'PP72', 2),
        (84, 5, 'C2', '1º - 2º',   'GP71', 'GP72', 2),
    ]

    for n, day, field, zone, h, a, rnd in final_specs:
        h_str = (str(h) if h is not None else '').strip()
        a_str = (str(a) if a is not None else '').strip()
        matches.append({
            'number': n,
            'day': day,
            'field': field,
            'zone': zone,
            'home': h_str,
            'away': a_str,
            'round': rnd,
            # ✅ BYE / informativo: si alguna pata está vacía o es BYE
            '_is_bye': (h_str.upper() == 'BYE' or a_str.upper() == 'BYE' or h_str == '' or a_str == ''),
        })

    return matches

def generate_24_team_full_tournament_6x4_seeded_legacy(teams: List[Team]) -> List[Dict[str, Any]]:
    """
    Sistema 6x4 SEMBRADO - 24 equipos
    Basado en 6X4_muestra_gpt_24_EQ.pdf (regular + fase final).
    """
    if len(teams) != 24:
        raise ValueError("Este modelo 6x4 sembrado está definido solo para 24 equipos.")

    def seed_name(seed: int) -> str:
        return teams[seed - 1].name  # seeds 1..24

    matches: List[Dict[str, Any]] = []

    # ----------------------------
    # FASE REGULAR (1..36) - Zonas A..F (4 equipos c/u)
    # ----------------------------
    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (5, 1, "C", 11, 12),
        (6, 1, "E", 19, 20),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (11, 1, "D", 15, 16),
        (12, 1, "F", 23, 24),

        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (17, 1, "C", 10, 12),
        (18, 1, "E", 18, 20),

        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (23, 2, "D", 14, 16),
        (24, 2, "F", 22, 24),

        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (29, 2, "C", 9, 12),
        (30, 2, "C", 10, 11),
        (31, 2, "D", 13, 16),
        (32, 2, "D", 14, 15),
        (33, 2, "E", 17, 20),
        (34, 2, "E", 18, 19),
        (35, 2, "F", 21, 24),
        (36, 2, "F", 22, 23),
    ]

    zone_round_counter: Dict[str, int] = {}
    for n, day, zone, h_seed, a_seed in regular_specs:
        zone_round_counter[zone] = zone_round_counter.get(zone, 0) + 1
        matches.append({
            "number": n,
            "day": day,
            "field": "",   # el PDF no fija cancha para autoubicar; tu lógica asigna luego
            "zone": zone,
            "home": seed_name(h_seed),
            "away": seed_name(a_seed),
            "round": zone_round_counter[zone],
            "_is_bye": False,
        })

    # ----------------------------
    # FASE FINAL (37..72)
    # ----------------------------
    final_specs = [
        # Día 3
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "4to. 4°"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "5to. 4°"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (45, 3, "LLAVE 3", "2do. 4°", "3er. 4°"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "6to. 4°"),

        # Día 4
        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (51, 4, "LLAVE 3", "PP39", "PP42"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),
        (54, 4, "LLAVE 3", "PP45", "PP48"),
        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "GP39", "GP42"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "GP45", "GP48"),

        # Día 5 (puestos)
        (61, 5, "23º - 24º", "PP51", "PP54"),
        (62, 5, "21º - 22º", "GP51", "GP54"),
        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    for n, day, zone, home, away in final_specs:
        matches.append({
            "number": n,
            "day": day,
            "field": "",
            "zone": zone,
            "home": home,
            "away": away,
            "round": None,
            "_is_bye": False,
        })

    return matches

# ============================================================
#  6x4 SEMBRADO (24..17) según PDFs
# ============================================================

def _build_seed_map_6x4_seeded(teams: List[Team], missing_seeds: List[int]) -> Dict[int, str]:
    """
    Mapea seeds (1..24) -> nombre de equipo, saltando seeds faltantes.
    Ej: 22 equipos => faltan [20, 24]. Entonces teams[0] es seed 1, ... teams[18] seed 19, teams[19] seed 21, etc.
    """
    missing = set(missing_seeds or [])
    seed_slots = [s for s in range(1, 25) if s not in missing]
    if len(teams) != len(seed_slots):
        raise ValueError(f"Cantidad de equipos ({len(teams)}) no coincide con seeds disponibles ({len(seed_slots)}).")
    return {seed_slots[i]: teams[i].name for i in range(len(seed_slots))}


def _seed_name(seed_map: Dict[int, str], seed: int) -> str:
    return seed_map.get(seed, "BYE")


def _is_bye_text(x: str) -> bool:
    return (x or "").strip().upper() == "BYE"


def _mk_match(number: int, day: int, zone: str, home: str, away: str, round_val: Optional[int] = None) -> Dict[str, Any]:
    home = (home or "").strip()
    away = (away or "").strip()
    bye_flag = (not home) or (not away) or _is_bye_text(home) or _is_bye_text(away)
    return {
        "number": number,
        "day": day,
        "field": "",
        "zone": zone,
        "home": home,
        "away": away,
        "round": round_val,
        "_is_bye": bool(bye_flag),
    }


def _build_6x4_regular(seed_map: Dict[int, str], specs: List[Tuple[int, int, str, int, int]]) -> List[Dict[str, Any]]:
    matches: List[Dict[str, Any]] = []
    zone_round_counter: Dict[str, int] = {}
    for n, day, zone, h_seed, a_seed in specs:
        zone_round_counter[zone] = zone_round_counter.get(zone, 0) + 1
        matches.append(_mk_match(
            number=n,
            day=day,
            zone=zone,
            home=_seed_name(seed_map, h_seed),
            away=_seed_name(seed_map, a_seed),
            round_val=zone_round_counter[zone],
        ))
    return matches


def _build_6x4_final(specs: List[Tuple[int, int, str, str, str]]) -> List[Dict[str, Any]]:
    matches: List[Dict[str, Any]] = []
    for n, day, zone, home, away in specs:
        matches.append(_mk_match(number=n, day=day, zone=zone, home=home, away=away, round_val=None))
    return matches


# ----------------------------
# 24 equipos
# ----------------------------
def generate_24_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[])
    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (5, 1, "C", 11, 12),
        (6, 1, "E", 19, 20),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (11, 1, "D", 15, 16),
        (12, 1, "F", 23, 24),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (17, 1, "C", 10, 12),
        # CORRECCIÓN: partido 18 va en Día 1
        (18, 1, "E", 18, 20),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (23, 2, "D", 14, 16),
        (24, 2, "F", 22, 24),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (29, 2, "C", 9, 12),
        (30, 2, "C", 10, 11),
        (31, 2, "D", 13, 16),
        (32, 2, "D", 14, 15),
        (33, 2, "E", 17, 20),
        (34, 2, "E", 18, 19),
        (35, 2, "F", 21, 24),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "4to. 4°"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "5to. 4°"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (45, 3, "LLAVE 3", "2do. 4°", "3er. 4°"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "6to. 4°"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (51, 4, "LLAVE 3", "PP39", "PP42"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),
        (54, 4, "LLAVE 3", "PP45", "PP48"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "GP39", "GP42"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "GP45", "GP48"),

        (61, 5, "23º - 24º", "PP51", "PP54"),
        (62, 5, "21º - 22º", "GP51", "GP54"),
        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 23 equipos (falta seed 24)
# ----------------------------
def generate_23_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (5, 1, "C", 11, 12),
        (6, 1, "E", 19, 20),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (11, 1, "D", 15, 16),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (17, 1, "C", 10, 12),
        (18, 1, "E", 18, 20),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (23, 2, "D", 14, 16),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (29, 2, "C", 9, 12),
        (30, 2, "C", 10, 11),
        (31, 2, "D", 13, 16),
        (32, 2, "D", 14, 15),
        (33, 2, "E", 17, 20),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "4to. 4°"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "5to. 4°"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (45, 3, "LLAVE 3", "2do. 4°", "3er. 4°"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (51, 4, "LLAVE 3", "PP39", "PP42"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),
        (54, 4, "LLAVE 3", "PP45", "BYE"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "GP39", "GP42"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "GP45", "5to. 3º"),

        (61, 5, "23º", "PP51", ""),
        (62, 5, "21º - 22º", "GP51", "GP54"),
        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 22 equipos (faltan 20 y 24)
# ----------------------------
def generate_22_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[20, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (5, 1, "C", 11, 12),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (11, 1, "D", 15, 16),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (17, 1, "C", 10, 12),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (23, 2, "D", 14, 16),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (29, 2, "C", 9, 12),
        (30, 2, "C", 10, 11),
        (31, 2, "D", 13, 16),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "4to. 4°"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "BYE"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (51, 4, "LLAVE 3", "PP39", "BYE"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),
        (54, 4, "LLAVE 3", "PP45", "BYE"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "GP39", "6to. 3º"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "GP45", "5to. 3º"),

        (62, 5, "21º - 22º", "PP39", "PP45"),
        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 21 equipos (faltan 16, 20, 24)
# ----------------------------
def generate_21_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[16, 20, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (5, 1, "C", 11, 12),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (17, 1, "C", 10, 12),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (29, 2, "C", 9, 12),
        (30, 2, "C", 10, 11),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "4to. 4°"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "BYE"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (45, 3, "LLAVE 3", "2do. 4°", "3er. 4°"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),
        (54, 4, "LLAVE 3", "PP45", "BYE"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "1er. 4°", "6to. 3º"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "GP45", "5to. 3º"),

        (62, 5, "21º", "PP45", ""),
        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 20 equipos (faltan 12, 16, 20, 24)
# ----------------------------
def generate_20_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[12, 16, 20, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (10, 1, "B", 7, 8),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (22, 2, "B", 6, 8),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (27, 2, "B", 5, 8),
        (28, 2, "B", 6, 7),
        (30, 2, "C", 10, 11),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "BYE"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "BYE"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (45, 3, "LLAVE 3", "2do. 4°", "BYE"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "1er. 4°", "6to. 3º"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "2do. 4°", "5to. 3º"),

        (63, 5, "19º - 20º", "PP57", "PP60"),
        (64, 5, "17º - 18º", "GP57", "GP60"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 19 equipos (faltan 8, 12, 16, 20, 24)
# ----------------------------
def generate_19_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[8, 12, 16, 20, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (4, 1, "A", 3, 4),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (16, 1, "A", 2, 4),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (25, 2, "A", 1, 4),
        (26, 2, "A", 2, 3),
        (28, 2, "B", 6, 7),
        (30, 2, "C", 10, 11),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (39, 3, "LLAVE 3", "1er. 4°", "BYE"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "BYE"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "1er. 4°", "6to. 3º"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "BYE", "5to. 3º"),

        (63, 5, "19º", "PP57", ""),
        (64, 5, "17º - 18º", "GP57", "5to. 3º"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 18 equipos (faltan 4, 8, 12, 16, 20, 24)
# ----------------------------
def generate_18_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[4, 8, 12, 16, 20, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (21, 2, "F", 21, 23),
        (26, 2, "A", 2, 3),
        (28, 2, "B", 6, 7),
        (30, 2, "C", 10, 11),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 23),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (42, 3, "LLAVE 3", "6to. 3º", "BYE"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "LLAVE 3", "5to. 3º", "BYE"),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (57, 4, "LLAVE 3", "BYE", "6to. 3º"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),
        (60, 4, "LLAVE 3", "BYE", "5to. 3º"),

        (64, 5, "17º - 18º", "6to. 3º", "5to. 3º"),
        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)


# ----------------------------
# 17 equipos (faltan 4, 8, 12, 16, 20, 23, 24)
# ----------------------------
def generate_17_team_full_tournament_6x4_seeded(teams: List[Team]) -> List[Dict[str, Any]]:
    seed_map = _build_seed_map_6x4_seeded(teams, missing_seeds=[4, 8, 12, 16, 20, 23, 24])

    regular_specs = [
        (1, 1, "A", 1, 2),
        (2, 1, "C", 9, 10),
        (3, 1, "E", 17, 18),
        (7, 1, "B", 5, 6),
        (8, 1, "D", 13, 14),
        (9, 1, "F", 21, 22),
        (13, 1, "A", 1, 3),
        (14, 1, "C", 9, 11),
        (15, 1, "E", 17, 19),
        (19, 2, "B", 5, 7),
        (20, 2, "D", 13, 15),
        (26, 2, "A", 2, 3),
        (28, 2, "B", 6, 7),
        (30, 2, "C", 10, 11),
        (32, 2, "D", 14, 15),
        (34, 2, "E", 18, 19),
        (36, 2, "F", 22, 21),
    ]

    final_specs = [
        (37, 3, "LLAVE 1", "3er. 1º", "6to. 1º"),
        (38, 3, "LLAVE 2", "5to. 2º", "2do. 3º"),
        (40, 3, "LLAVE 1", "2do. 1º", "1er. 2º"),
        (41, 3, "LLAVE 2", "4to. 2º", "3er. 3º"),
        (43, 3, "LLAVE 1", "4to. 1º", "5to. 1º"),
        (44, 3, "LLAVE 2", "6to. 2º", "1er. 3º"),
        (46, 3, "LLAVE 1", "1er. 1º", "2do. 2º"),
        (47, 3, "LLAVE 2", "3er. 2º", "4to. 3º"),
        (48, 3, "17º", "5to. 3º", ""),

        (49, 4, "LLAVE 1", "PP37", "PP40"),
        (50, 4, "LLAVE 2", "PP38", "PP41"),
        (52, 4, "LLAVE 1", "PP43", "PP46"),
        (53, 4, "LLAVE 2", "PP44", "PP47"),

        (55, 4, "LLAVE 1", "GP37", "GP40"),
        (56, 4, "LLAVE 2", "GP38", "GP41"),
        (58, 4, "LLAVE 1", "GP43", "GP46"),
        (59, 4, "LLAVE 2", "GP44", "GP47"),

        (65, 5, "15º - 16º", "PP50", "PP53"),
        (66, 5, "13º - 14º", "GP50", "GP53"),
        (67, 5, "11º - 12º", "PP56", "PP59"),
        (68, 5, "9º - 10º", "GP56", "GP59"),
        (69, 5, "7º - 8º", "PP49", "PP52"),
        (70, 5, "5º - 6º", "GP49", "GP52"),
        (71, 5, "3º - 4º", "PP55", "PP58"),
        (72, 5, "1º - 2º", "GP55", "GP58"),
    ]

    return _build_6x4_regular(seed_map, regular_specs) + _build_6x4_final(final_specs)
def generar_mapa_visual_llaves(partidos_eliminacion):
    """
    Analiza los partidos y los organiza en columnas (Ronda 1, Cuartos, Semis, Final)
    detectando automáticamente la jerarquía de los cruces.
    """
    columnas = {}

    for partido in partidos_eliminacion:
        desc = str(partido.get('zona', ''))
        # Detectamos en qué nivel de la llave está el partido por su descripción
        if "Final" in desc or "1º" in desc:
            nivel = 4
        elif "Semi" in desc:
            nivel = 3
        elif "Cuartos" in desc:
            nivel = 2
        else:
            nivel = 1 # Octavos o fase inicial de llaves

        if nivel not in columnas:
            columnas[nivel] = []
        columnas[nivel].append(partido)

    return columnas
