import json
import os
import sys
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / ".." / "backend" / "apps" / "core" / "management" / "commands"

PLANET_INPUT = OUTPUT_DIR / "maps_tiered_stats_planet.json"
BRAWLIFY_INPUT = OUTPUT_DIR / "maps_tiered_stats_brawlify.json"

MAPS_OUTPUT = OUTPUT_DIR / "maps_tiered_stats.json"
GLOBAL_OUTPUT = OUTPUT_DIR / "brawlers_global_stats.json"

def clean_name(name: str) -> str:
    return name.strip().lower().replace(".", "").replace(",", "")

def compute_global_stats(maps_data: list[dict]) -> list[dict]:
    """Recalculate global averages across all processed maps."""
    accumulator = {}
    
    for map_entry in maps_data:
        for stat in map_entry.get("stats", []):
            name = stat["brawler_name"]
            bid = stat.get("brawler_id")
            # Group by brawler_id if available, fallback to lowercase name
            key = bid if bid else clean_name(name)
            
            if key not in accumulator:
                accumulator[key] = {
                    "brawler_name": name,
                    "brawler_id": bid,
                    "win_sum": 0.0,
                    "pick_sum": 0.0,
                    "count": 0
                }
            
            accumulator[key]["win_sum"] += stat["win_rate"]
            accumulator[key]["pick_sum"] += stat["pick_rate"]
            accumulator[key]["count"] += 1

    global_stats = []
    for key, data in accumulator.items():
        n = data["count"]
        if n == 0:
            continue
        entry = {
            "brawler_name": data["brawler_name"],
            "win_rate": round(data["win_sum"] / n, 6),
            "pick_rate": round(data["pick_sum"] / n, 6),
        }
        if data["brawler_id"]:
            entry["brawler_id"] = data["brawler_id"]
        global_stats.append(entry)

    return sorted(global_stats, key=lambda x: x["win_rate"], reverse=True)

def main():
    print("============================================================")
    print("Starting Merge of BrawlPlanet and Brawlify Stats...")
    print("============================================================")

    # 1. Load BrawlPlanet Data
    if not PLANET_INPUT.exists():
        print(f"[ERROR] BrawlPlanet data file not found at: {PLANET_INPUT}")
        sys.exit(1)
        
    with open(PLANET_INPUT, "r", encoding="utf-8") as f:
        planet_data = json.load(f)
    print(f"Loaded {len(planet_data)} maps from BrawlPlanet.")

    # 2. Load Brawlify Data
    brawlify_data = []
    if BRAWLIFY_INPUT.exists():
        with open(BRAWLIFY_INPUT, "r", encoding="utf-8") as f:
            brawlify_data = json.load(f)
        print(f"Loaded {len(brawlify_data)} maps from Brawlify.")
    else:
        print(f"[WARN] Brawlify data file not found at: {BRAWLIFY_INPUT}. Proceeding with BrawlPlanet data only.")

    # Index Brawlify by map name for quick lookup
    brawlify_by_map = {clean_name(m["map_name"]): m for m in brawlify_data}

    merged_maps = []

    # 3. Merge Map Data
    for planet_map in planet_data:
        map_name = planet_map["map_name"]
        cleaned_map_name = clean_name(map_name)
        
        # Prepare the base map entry
        merged_map = {
            "map_name": map_name,
            "map_slug": planet_map.get("map_slug"),
            "trophy_range": planet_map.get("trophy_range", "Diamond I+"),
            "stats": []
        }
        
        # Check if we have Brawlify data for this map
        brawlify_map = brawlify_by_map.get(cleaned_map_name)
        if brawlify_map:
            # Inject Brawlify's map_id directly so sync_meta_stats matches by ID
            merged_map["map_id"] = brawlify_map.get("map_id")
            
            # Map brawlers from both sources
            # Dict key: clean_name of brawler -> brawler entry
            brawler_stats = {}
            
            # Load BrawlPlanet stats first (baseline completeness)
            for p_stat in planet_map.get("stats", []):
                b_name = p_stat["brawler_name"]
                brawler_stats[clean_name(b_name)] = p_stat.copy()
            
            # Overwrite or insert Brawlify stats (fresh win/pick rates + new brawlers)
            for b_stat in brawlify_map.get("stats", []):
                b_name = b_stat["brawler_name"]
                cleaned_b_name = clean_name(b_name)
                
                # Brawlify entry details
                b_entry = {
                    "brawler_name": b_name,
                    "brawler_id": b_stat.get("brawler_id"),
                    "win_rate": b_stat["win_rate"],
                    "pick_rate": b_stat["pick_rate"],
                    "category": b_stat.get("category", "best_pick")
                }
                
                # Overwrite/Insert
                brawler_stats[cleaned_b_name] = b_entry
                
            merged_map["stats"] = list(brawler_stats.values())
            print(f"  Merged {map_name}: {len(planet_map.get('stats', []))} (Planet) -> {len(merged_map['stats'])} total brawlers (updated with Brawlify).")
        else:
            # Fallback entirely to BrawlPlanet if no Brawlify match found
            merged_map["stats"] = planet_map.get("stats", [])
            print(f"  Fallback {map_name}: keeping all {len(merged_map['stats'])} brawlers from BrawlPlanet.")
            
        merged_maps.append(merged_map)

    # 4. Save merged maps
    with open(MAPS_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(merged_maps, f, ensure_ascii=False, indent=2)
    print(f"\n✅ Merged maps saved to {MAPS_OUTPUT} ({MAPS_OUTPUT.stat().st_size / 1024:.1f} KB)")

    # 5. Compute and save recalculated global stats
    global_stats = compute_global_stats(merged_maps)
    with open(GLOBAL_OUTPUT, "w", encoding="utf-8") as f:
        json.dump(global_stats, f, ensure_ascii=False, indent=2)
    print(f"✅ Recalculated global stats saved to {GLOBAL_OUTPUT} ({GLOBAL_OUTPUT.stat().st_size / 1024:.1f} KB)")
    print(f"Total Unique Brawlers: {len(global_stats)}")
    print("============================================================\n")

if __name__ == "__main__":
    main()
