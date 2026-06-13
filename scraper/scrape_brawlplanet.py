"""
scrape_brawlplanet.py
=====================
Scraper local de BrawlPlanet para extraer estadísticas de brawlers por mapa.
No requiere browser — usa curl-cffi que emula el TLS fingerprint de Chrome.

Extrae las estadísticas competitivas del modo Ranked directamente desde
https://www.brawlplanet.com/powerleague.

Genera dos archivos JSON que alimentan el pipeline de Django:
  - ../backend/apps/core/management/commands/maps_tiered_stats.json
  - ../backend/apps/core/management/commands/brawlers_global_stats.json

Uso:
    pip install -r requirements.txt
    python scrape_brawlplanet.py [--dry-run]

    --dry-run   Procesa solo el primer mapa (para validar la estructura)
"""

from html import unescape as html_unescape
import json
import re
import sys
import argparse
from collections import defaultdict
from pathlib import Path

from curl_cffi import requests as cffi_requests


# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

# Mapas del ranked pool actual (slug BrawlPlanet → nombre canónico del proyecto)
RANKED_MAP_POOL = {
    "shootingstar_bounty":    "Shooting Star",
    "dryseason_bounty":       "Dry Season",
    "layercake_bounty":       "Layer Cake",
    "hideout_bounty":         "Hideout",
    "doubleswoosh_gemgrab":   "Double Swoosh",
    "gemfort_gemgrab":        "Gem Fort",
    "hardrockmine_gemgrab":   "Hard Rock Mine",
    "undermine_gemgrab":      "Undermine",
    "bridgetoofar_heist":     "Bridge Too Far",
    "hotpotato_heist":        "Hot Potato",
    "kaboomcanyon_heist":     "Kaboom Canyon",
    "safezone_heist":         "Safe Zone",
    "centerstage_brawlball":  "Center Stage",
    "pinballdreams_brawlball": "Pinball Dreams",
    "sneakyfields_brawlball": "Sneaky Fields",
    "tripledribble_brawlball": "Triple Dribble",
    "duelingbeetles_hotzone": "Dueling Beetles",
    "openbusiness_hotzone":   "Open Business",
    "parallelplays_hotzone":  "Parallel Plays",
    "ringoffire_hotzone":     "Ring of Fire",
    "bellesrock_knockout":    "Belles Rock",
    "flaringphoenix_knockout": "Flaring Phoenix",
    "flowingsprings_knockout": "Flowing Springs",
    "goldarmgulch_knockout":  "Goldarm Gulch",
    "newhorizons_knockout":   "New Horizons",
    "outintheopen_knockout":  "Out in the Open",
}

POWERLEAGUE_URL = "https://www.brawlplanet.com/powerleague"
TROPHY_RANGE = "Diamond I+"

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / ".." / "backend" / "apps" / "core" / "management" / "commands"
MAPS_OUTPUT = OUTPUT_DIR / "maps_tiered_stats_planet.json"
GLOBAL_OUTPUT = OUTPUT_DIR / "brawlers_global_stats_planet.json"

# Custom/Fictional brawlers that should not be included in the dataset
BRAWLERS_TO_IGNORE = {
    "buzz lightyear", "meeple", "ollie", "lumi", "jae-yong", "kaze",
    "alli", "trunk", "mina", "ziggy", "pierce", "gigi", "glowy", "sirius",
    "damian", "starr nova", "bolt"
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def format_brawler_name(name: str) -> str:
    name = name.strip()
    EXCEPTIONS = {
        "MR. P": "Mr. P",
        "EL PRIMO": "El Primo",
        "8-BIT": "8-Bit",
        "LARRY & LAWRIE": "Larry & Lawrie",
        "R-T": "R-T",
    }
    if name in EXCEPTIONS:
        return EXCEPTIONS[name]
    return name.title()


def assign_category(win_rate: float, pick_rate: float, rank_in_map: int, total: int) -> str:
    if win_rate >= 0.55 and pick_rate >= 0.05:
        return "best_pick"
    if win_rate >= 0.52:
        return "winner"
    if pick_rate >= 0.07:
        return "most_used"
    return "not_recommended"


# ---------------------------------------------------------------------------
# Parser de Mapas desde el HTML de PowerLeague
# ---------------------------------------------------------------------------

def parse_map_from_powerleague(html: str, map_slug: str, canonical_name: str) -> dict | None:
    match = re.search(r'\\\"' + map_slug + r'\\\":', html)
    if not match:
        return None
    
    start = match.end()
    brace_count = 0
    end = 0
    chunk = html[start:start+150000]
    for i, char in enumerate(chunk):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end = i + 1
                break
                
    if end == 0:
        return None
        
    map_str = chunk[:end]
    map_str_clean = map_str.replace('\\"', '"').replace('\\\\', '\\')
    
    try:
        map_json = json.loads(map_str_clean)
        raw_brawlers = map_json.get("individual", [])
        
        stats = []
        for i, b in enumerate(raw_brawlers):
            raw_name = b.get("brawler", "").strip()
            if not raw_name:
                continue
                
            name = html_unescape(raw_name)
            name = format_brawler_name(name)
            
            # Skip custom/fictional brawlers
            if name.lower() in BRAWLERS_TO_IGNORE:
                continue
                
            win_pct = b.get("wr", 0.0)
            pick_pct = b.get("ur", 0.0)
            
            # Convert to decimal percentages (60.0% -> 0.60)
            win_rate = round(float(win_pct) / 100, 6)
            pick_rate = round(float(pick_pct) / 100, 6)
            
            cat = assign_category(win_rate, pick_rate, len(stats), len(raw_brawlers))
            
            stats.append({
                "brawler_name": name,
                "win_rate": win_rate,
                "pick_rate": pick_rate,
                "category": cat,
            })
            
        return {
            "map_slug": map_slug,
            "map_name": canonical_name,
            "trophy_range": TROPHY_RANGE,
            "stats": stats,
        }
    except Exception as e:
        print(f"  [ERROR] parsing {map_slug}: {e}")
        return None


# ---------------------------------------------------------------------------
# Cálculo de estadísticas globales
# ---------------------------------------------------------------------------

def compute_global_stats(maps_data: list[dict]) -> list[dict]:
    acc = defaultdict(lambda: {"win_sum": 0.0, "pick_sum": 0.0, "count": 0})

    for map_entry in maps_data:
        for stat in map_entry.get("stats", []):
            name = stat["brawler_name"]
            acc[name]["win_sum"] += stat["win_rate"]
            acc[name]["pick_sum"] += stat["pick_rate"]
            acc[name]["count"] += 1

    global_stats = []
    for name, data in sorted(acc.items()):
        n = data["count"]
        if n == 0:
            continue
        global_stats.append({
            "brawler_name": name,
            "win_rate": round(data["win_sum"] / n, 6),
            "pick_rate": round(data["pick_sum"] / n, 6),
        })

    return sorted(global_stats, key=lambda x: x["win_rate"], reverse=True)


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------

def main(dry_run: bool = False):
    slugs = list(RANKED_MAP_POOL.items())
    if dry_run:
        slugs = slugs[:1]

    mode = "DRY-RUN (1 mapa)" if dry_run else f"{len(slugs)} mapas"

    print(f"\n{'='*60}")
    print(f"  BrawlPlanet Ranked Scraper — Modo: {mode}")
    print(f"  Fuente: {POWERLEAGUE_URL}")
    print(f"  Salida: {OUTPUT_DIR.resolve()}")
    print(f"{'='*60}\n")

    session = cffi_requests.Session(impersonate="chrome124")

    print("⏳ Descargando página competitiva de Ranked...")
    try:
        resp = session.get(POWERLEAGUE_URL, timeout=25)
        if resp.status_code != 200:
            print(f"[ERROR] HTTP {resp.status_code} al descargar {POWERLEAGUE_URL}")
            sys.exit(1)
        print(f"✓ Descarga completada ({len(resp.text)} caracteres)\n")
    except Exception as e:
        print(f"[ERROR] Falló la descarga de {POWERLEAGUE_URL}: {e}")
        sys.exit(1)

    maps_data = []
    failed_maps = []

    for i, (slug, canonical_name) in enumerate(slugs, 1):
        print(f"[{i:02d}/{len(slugs):02d}] Procesando {canonical_name} ({slug})...")
        result = parse_map_from_powerleague(resp.text, slug, canonical_name)

        if result:
            maps_data.append(result)
        else:
            print(f"  [ERROR] No se encontraron estadísticas para {canonical_name} ({slug}) en la página de Ranked.")
            failed_maps.append(slug)

    # ---------------------------------------------------------------------------
    # Escribir archivos de salida
    # ---------------------------------------------------------------------------

    if not maps_data:
        print("\n[ERROR] No se pudo parsear ninguna información de mapas. Abortando.")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(MAPS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(maps_data, f, ensure_ascii=False, indent=2)
    size_kb = MAPS_OUTPUT.stat().st_size / 1024
    print(f"\n✅ maps_tiered_stats_planet.json → {len(maps_data)} mapas ({size_kb:.1f} KB)")

    global_stats = compute_global_stats(maps_data)
    with open(GLOBAL_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(global_stats, f, ensure_ascii=False, indent=2)
    size_kb2 = GLOBAL_OUTPUT.stat().st_size / 1024
    print(f"✅ brawlers_global_stats_planet.json → {len(global_stats)} brawlers ({size_kb2:.1f} KB)")

    # Reporte
    total_entries = sum(len(m["stats"]) for m in maps_data)
    print(f"\n{'='*60}")
    print(f"  RESUMEN")
    print(f"  Mapas procesados: {len(maps_data)}/{len(slugs)}")
    if failed_maps:
        print(f"  Mapas fallidos:   {', '.join(failed_maps)}")
    print(f"  Entradas totales: {total_entries}")
    print(f"  Brawlers únicos:  {len(global_stats)}")
    print(f"{'='*60}\n")

    if failed_maps:
        print(f"[WARN] {len(failed_maps)} mapas no se encontraron.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scraper de BrawlPlanet para stats de ranked.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Procesa solo el primer mapa para validar el scraper.")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
