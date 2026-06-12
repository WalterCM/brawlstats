import os
import re
import json
import urllib.parse
import requests
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from apps.core.models import Brawler, Map
from apps.brawlers.models import MetaBrawlerStats, MetaMapStats

class Command(BaseCommand):
    help = "Scrapes meta statistics from Brawl Time Ninja and updates is_ranked status of maps"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting meta statistics sync..."))

        # 1. Load active ranked map pool from JSON file (map name -> mode)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        pool_file = os.path.join(current_dir, "ranked_map_pool.json")
        
        if not os.path.exists(pool_file):
            self.stdout.write(self.style.ERROR(f"Ranked map pool file not found at {pool_file}"))
            return

        with open(pool_file, "r") as f:
            ranked_pool = json.load(f)
        
        self.stdout.write(self.style.NOTICE(f"Loaded {len(ranked_pool)} maps from ranked pool configuration."))

        # 2. Reset and update is_ranked status. 
        # To avoid duplicate cards on the frontend, we tag exactly ONE canonical Map record 
        # in the database for each configured map name.
        updated_ranked_count = 0
        with transaction.atomic():
            # Reset all maps first
            Map.objects.all().update(is_ranked=False)
            
            for map_name, map_mode in ranked_pool.items():
                # First try to find a map matching both name and mode
                matching_maps = Map.objects.filter(name__iexact=map_name, mode__iexact=map_mode).order_by('id')
                
                # If not found (e.g. game mode naming variance like Bounty vs Wipeout), search by name only
                if not matching_maps.exists():
                    matching_maps = Map.objects.filter(name__iexact=map_name).order_by('id')
                
                # Tag the first matched record as the canonical ranked map
                canonical_map = matching_maps.first()
                if canonical_map:
                    canonical_map.is_ranked = True
                    canonical_map.save()
                    updated_ranked_count += 1
                else:
                    self.stdout.write(self.style.WARNING(f"Could not find any database map for: {map_name} ({map_mode})"))
                    
        self.stdout.write(self.style.SUCCESS(f"Updated maps in DB: tagged {updated_ranked_count} canonical maps as is_ranked=True."))

        # Setup request headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }

        # 2b. Build a lookup for map names and game modes from Brawl Time Ninja's master list
        self.stdout.write(self.style.NOTICE("Fetching master maps directory from Brawl Time Ninja for name/mode resolution..."))
        map_lookup = {}
        try:
            res_maps = requests.get("https://brawltime.ninja/tier-list/map", headers=headers, timeout=20)
            if res_maps.status_code == 200:
                match_json = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', res_maps.text, re.DOTALL)
                if match_json:
                    payload = json.loads(match_json[0])
                    queries = payload.get('vueQueryState', {}).get('queries', [])
                    for q in queries:
                        q_hash = q.get('queryHash', '')
                        if 'active-events' in str(q_hash) or 'klicker-query' in str(q_hash):
                            q_data = q.get('state', {}).get('data', [])
                            if isinstance(q_data, list) and len(q_data) > 0 and isinstance(q_data[0], dict) and 'map' in q_data[0]:
                                # Found the maps master list!
                                for item in q_data:
                                    m_name = item.get('map')
                                    m_mode = item.get('mode')
                                    if m_name and m_mode:
                                        # Normalize lookup keys by removing spaces, hyphens, and apostrophes
                                        key = m_name.strip().upper().replace("'", "").replace(" ", "").replace("-", "")
                                        map_lookup[key] = {
                                            "name": m_name,
                                            "mode": m_mode
                                        }
                                self.stdout.write(self.style.SUCCESS(f"Successfully loaded {len(map_lookup)} maps from Brawl Time Ninja directory."))
                                break
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Could not build dynamic map lookup: {str(e)}. Falling back to DB name/mode mapping."))

        # Cache brawlers by normalized name to avoid N+1 queries
        brawlers_db = Brawler.objects.all()
        brawlers_by_name = {b.name.strip().upper(): b for b in brawlers_db}
        # Also handle standard alias modifications (e.g. spaces/periods in names)
        # e.g., 'EL PRIMO' vs 'EL_PRIMO' or 'MR. P' vs 'MR P'
        brawlers_by_normalized_key = {}
        for b in brawlers_db:
            k = b.name.strip().upper().replace(".", "").replace(" ", "").replace("-", "").replace("_", "")
            brawlers_by_normalized_key[k] = b

        def find_brawler(name_str):
            name_normalized = name_str.strip().upper()
            if name_normalized in brawlers_by_name:
                return brawlers_by_name[name_normalized]
            k = name_normalized.replace(".", "").replace(" ", "").replace("-", "").replace("_", "")
            return brawlers_by_normalized_key.get(k, None)

        # 3. Fetch global meta statistics for all Brawlers
        self.stdout.write(self.style.NOTICE("Fetching global meta statistics from Brawl Time Ninja..."))
        global_url = "https://brawltime.ninja/tier-list/brawler"
        try:
            res = requests.get(global_url, headers=headers, timeout=20)
            if res.status_code == 200:
                match_json = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', res.text, re.DOTALL)
                if match_json:
                    payload = json.loads(match_json[0])
                    queries = payload.get('vueQueryState', {}).get('queries', [])
                    
                    # Look for the query containing global stats
                    global_query = None
                    for q in queries:
                        q_hash = q.get('queryHash', '')
                        if 'klicker-query' in str(q_hash):
                            q_data = q.get('state', {}).get('data', {})
                            q_query = q_data.get('query', {})
                            # Global query has dimensionsIds=['brawler'], metricsIds=['winRateAdj', 'useRate'], and no map/mode slice
                            if q_query.get('cubeId') == 'map' and q_query.get('dimensionsIds') == ['brawler']:
                                metrics = q_query.get('metricsIds', [])
                                slices = q_query.get('slices', {})
                                if 'winRateAdj' in metrics and not slices.get('map') and not slices.get('mode'):
                                    global_query = q_data
                                    break
                    
                    if global_query:
                        stats_list = global_query.get('data', [])
                        self.stdout.write(self.style.NOTICE(f"Found {len(stats_list)} brawler entries in global meta query."))
                        brawlers_updated = 0
                        
                        with transaction.atomic():
                            # Remove older entries for today to prevent duplicates if run multiple times
                            MetaBrawlerStats.objects.filter(date=timezone.now().date()).delete()
                            
                            for entry in stats_list:
                                brawler_name = entry.get('dimensionsRaw', {}).get('brawler', {}).get('brawler')
                                if not brawler_name:
                                    continue
                                
                                brawler_obj = find_brawler(brawler_name)
                                if brawler_obj:
                                    win_rate = entry.get('metricsRaw', {}).get('winRateAdj', 0.5)
                                    pick_rate = entry.get('metricsRaw', {}).get('useRate', 0.0)
                                    
                                    MetaBrawlerStats.objects.create(
                                        brawler=brawler_obj,
                                        win_rate=win_rate,
                                        pick_rate=pick_rate
                                    )
                                    brawlers_updated += 1
                        self.stdout.write(self.style.SUCCESS(f"Ingested {brawlers_updated} global brawler meta stats."))
                    else:
                        self.stdout.write(self.style.WARNING("Could not find matching global query block in JSON payload."))
                else:
                    self.stdout.write(self.style.WARNING("Could not find script block with JSON state on global page."))
            else:
                self.stdout.write(self.style.ERROR(f"Failed to fetch global page. Status code: {res.status_code}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error syncing global stats: {str(e)}"))

        # 4. Fetch map-specific meta statistics for each active ranked map
        self.stdout.write(self.style.NOTICE("Fetching map-specific statistics for active Ranked maps..."))
        active_ranked_maps = Map.objects.filter(is_ranked=True)
        
        mode_slug_map = {
            "Gem Grab": "gem-grab",
            "Brawl Ball": "brawl-ball",
            "Hot Zone": "hot-zone",
            "Knockout": "knockout",
            "Bounty": "bounty",
            "Heist": "heist",
        }

        # Deduplicate maps by name for scraping to avoid double fetching
        seen_map_names = set()
        unique_ranked_maps = []
        for r_map in active_ranked_maps:
            if r_map.name not in seen_map_names:
                seen_map_names.add(r_map.name)
                unique_ranked_maps.append(r_map)

        for r_map in unique_ranked_maps:
            normalized_name = r_map.name.strip().upper().replace("'", "").replace(" ", "").replace("-", "")
            resolved = map_lookup.get(normalized_name)
            
            if resolved:
                map_name_ninja = resolved["name"]
                mode_raw = resolved["mode"]
                # Convert camelCase mode to hyphenated mode slug (e.g., brawlBall -> brawl-ball)
                mode_slug = re.sub(r'(?<!^)(?=[A-Z])', '-', mode_raw).lower()
            else:
                map_name_ninja = r_map.name
                mode_slug = mode_slug_map.get(r_map.mode, r_map.mode.lower().replace(" ", "-"))

            map_name_encoded = urllib.parse.quote(map_name_ninja)
            map_url = f"https://brawltime.ninja/tier-list/mode/{mode_slug}/map/{map_name_encoded}"
            
            self.stdout.write(self.style.NOTICE(f"Scraping stats for map: {map_name_ninja} ({mode_slug}) -> {map_url}"))
            
            try:
                res = requests.get(map_url, headers=headers, timeout=20)
                if res.status_code != 200:
                    self.stdout.write(self.style.WARNING(f"Could not load stats page for {map_name_ninja} (HTTP {res.status_code})"))
                    continue
                
                match_json = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', res.text, re.DOTALL)
                if not match_json:
                    self.stdout.write(self.style.WARNING(f"JSON payload not found for map {map_name_ninja}"))
                    continue
                
                payload = json.loads(match_json[0])
                queries = payload.get('vueQueryState', {}).get('queries', [])
                
                # Find the query containing brawler stats for this map
                map_query = None
                for q in queries:
                    q_hash = q.get('queryHash', '')
                    if 'klicker-query' in str(q_hash):
                        q_data = q.get('state', {}).get('data', {})
                        q_query = q_data.get('query', {})
                        if q_query.get('cubeId') == 'map' and q_query.get('dimensionsIds') == ['brawler']:
                            metrics = q_query.get('metricsIds', [])
                            slices = q_query.get('slices', {})
                            # Map-specific query has winRateAdj in metrics, and slices has map name
                            if 'winRateAdj' in metrics and slices.get('map'):
                                map_query = q_data
                                break
                
                if map_query:
                    stats_list = map_query.get('data', [])
                    self.stdout.write(self.style.NOTICE(f"  Found {len(stats_list)} brawler entries for map {map_name_ninja}."))
                    map_stats_saved = 0
                    
                    # Update all DB maps that share this same name (e.g. duplicate definitions)
                    matching_db_maps = Map.objects.filter(name__iexact=r_map.name)
                    
                    with transaction.atomic():
                        for m_db in matching_db_maps:
                            # Clear old entries for this map today to prevent duplicates
                            MetaMapStats.objects.filter(map=m_db, date=timezone.now().date()).delete()
                        
                        for entry in stats_list:
                            brawler_name = entry.get('dimensionsRaw', {}).get('brawler', {}).get('brawler')
                            if not brawler_name:
                                continue
                            
                            brawler_obj = find_brawler(brawler_name)
                            if brawler_obj:
                                win_rate = entry.get('metricsRaw', {}).get('winRateAdj', 0.5)
                                
                                for m_db in matching_db_maps:
                                    MetaMapStats.objects.create(
                                        brawler=brawler_obj,
                                        map=m_db,
                                        win_rate=win_rate
                                    )
                                map_stats_saved += 1
                    self.stdout.write(self.style.SUCCESS(f"  Successfully ingested {map_stats_saved} map brawler stats for all instances of {map_name_ninja}."))
                else:
                    self.stdout.write(self.style.WARNING(f"  Could not find matching query block for map {map_name_ninja} in JSON payload."))
            
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Error syncing stats for map {map_name_ninja}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS("Meta statistics sync completed successfully!"))
