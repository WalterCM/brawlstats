import os
import json
import html as html_lib
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from apps.core.models import Brawler, Map
from apps.brawlers.models import MetaBrawlerStats, MetaMapStats


class Command(BaseCommand):
    help = "Ingests brawler and map meta statistics from local JSON files (scraped from BrawlPlanet)"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting meta statistics ingestion from JSON files..."))

        current_dir = os.path.dirname(os.path.abspath(__file__))
        maps_file = os.path.join(current_dir, "maps_tiered_stats.json")
        global_file = os.path.join(current_dir, "brawlers_global_stats.json")

        # ----------------------------------------------------------------
        # 1. Load merged map stats file early
        # ----------------------------------------------------------------
        if not os.path.exists(maps_file):
            self.stdout.write(self.style.ERROR(f"Map stats file not found at {maps_file}"))
            return

        with open(maps_file, "r", encoding="utf-8") as f:
            maps_data = json.load(f)

        self.stdout.write(self.style.NOTICE(f"Loaded {len(maps_data)} maps from merged stats file."))

        # Helper for robust case/punctuation insensitive name resolution
        def normalize_name(s: str) -> str:
            if not s:
                return ""
            return (
                html_lib.unescape(s)
                .strip()
                .lower()
                .replace("'", "")
                .replace("’", "")
                .replace("-", " ")
                .replace("  ", " ")
            )

        # ----------------------------------------------------------------
        # 2. Build lookup caches (name & ID → object) for efficient matching
        # ----------------------------------------------------------------
        all_brawlers = list(Brawler.objects.all())
        all_maps = list(Map.objects.all())

        brawler_cache: dict[str, Brawler] = {
            normalize_name(b.name): b for b in all_brawlers
        }
        brawler_id_cache: dict[str, Brawler] = {
            str(b.id): b for b in all_brawlers
        }

        map_cache: dict[str, Map] = {
            normalize_name(m.name): m for m in all_maps
        }
        map_id_cache: dict[str, Map] = {
            str(m.id): m for m in all_maps
        }

        self.stdout.write(self.style.NOTICE(
            f"Caches built: {len(all_brawlers)} brawlers, {len(all_maps)} maps."
        ))

        def resolve_brawler(entry: dict) -> Brawler | None:
            """Resolves a brawler using cache lookups (no database queries)."""
            brawler_id = entry.get("brawler_id")
            if brawler_id:
                return brawler_id_cache.get(str(brawler_id))
            raw_name = entry.get("brawler_name") or ""
            return brawler_cache.get(normalize_name(raw_name))

        def resolve_map(entry: dict) -> Map | None:
            """Resolves a map using cache lookups (no database queries)."""
            map_id = entry.get("map_id")
            if map_id:
                return map_id_cache.get(str(map_id))
            raw_name = entry.get("map_name") or ""
            return map_cache.get(normalize_name(raw_name))

        # ----------------------------------------------------------------
        # 3. Dynamically update active ranked map pool in database
        # ----------------------------------------------------------------
        updated_ranked_count = 0
        with transaction.atomic():
            Map.objects.all().update(is_ranked=False)
            for map_entry in maps_data:
                canonical_map = resolve_map(map_entry)
                if canonical_map:
                    canonical_map.is_ranked = True
                    canonical_map.save()
                    updated_ranked_count += 1
                else:
                    self.stdout.write(self.style.WARNING(
                        f"Could not find any database map for: {map_entry.get('map_name')} ({map_entry.get('map_slug')})"
                    ))

        self.stdout.write(self.style.SUCCESS(
            f"Updated maps in DB: tagged {updated_ranked_count} canonical maps as is_ranked=True."
        ))

        # Re-build caches to reflect updated map is_ranked states
        all_maps = list(Map.objects.all())
        map_cache = {
            normalize_name(m.name): m for m in all_maps
        }
        map_id_cache = {
            str(m.id): m for m in all_maps
        }

        # ----------------------------------------------------------------
        # 4. Ingest Global Brawler Stats (Optimized with bulk_create)
        # ----------------------------------------------------------------
        if not os.path.exists(global_file):
            self.stdout.write(self.style.WARNING(
                f"Global stats file not found at {global_file}. Skipping global stats ingestion."
            ))
        else:
            self.stdout.write(self.style.NOTICE(f"Reading global stats from {global_file}..."))
            with open(global_file, "r", encoding="utf-8") as f:
                global_data = json.load(f)

            brawlers_updated = 0
            skipped = 0
            with transaction.atomic():
                MetaBrawlerStats.objects.filter(date=timezone.now().date()).delete()

                to_create_global = []
                for entry in global_data:
                    win_rate = float(entry.get("win_rate", 0.5))
                    pick_rate = float(entry.get("pick_rate", 0.0))

                    brawler_obj = resolve_brawler(entry)
                    if not brawler_obj:
                        skipped += 1
                        continue

                    to_create_global.append(MetaBrawlerStats(
                        brawler=brawler_obj,
                        win_rate=win_rate,
                        pick_rate=pick_rate,
                        tier=2  # Global fallback is Tier 2
                    ))

                if to_create_global:
                    MetaBrawlerStats.objects.bulk_create(to_create_global)
                    brawlers_updated = len(to_create_global)

            self.stdout.write(self.style.SUCCESS(
                f"Successfully ingested {brawlers_updated} global brawler meta stats. "
                f"({skipped} skipped)"
            ))

        # ----------------------------------------------------------------
        # 5. Ingest Map-Specific Stats (Optimized with bulk_create)
        # ----------------------------------------------------------------
        self.stdout.write(self.style.NOTICE(f"Reading map-specific stats from {maps_file}..."))

        map_stats_updated = 0
        maps_skipped = 0
        brawlers_skipped = 0
        
        with transaction.atomic():
            # Clear existing map-specific stats for today for all resolved maps in a single query
            map_objs_to_clear = []
            for map_entry in maps_data:
                map_obj = resolve_map(map_entry)
                if map_obj:
                    map_objs_to_clear.append(map_obj)
            
            if map_objs_to_clear:
                MetaMapStats.objects.filter(
                    map__in=map_objs_to_clear,
                    date=timezone.now().date()
                ).delete()

            to_create_map_stats = []
            for map_entry in maps_data:
                trophy_range = map_entry.get("trophy_range", "1000+")
                stats = map_entry.get("stats", [])

                map_obj = resolve_map(map_entry)
                if not map_obj:
                    maps_skipped += 1
                    continue

                for entry in stats:
                    win_rate = float(entry.get("win_rate", 0.5))
                    pick_rate = float(entry.get("pick_rate", 0.0))
                    category = entry.get("category", "best_pick")

                    brawler_obj = resolve_brawler(entry)
                    if not brawler_obj:
                        brawlers_skipped += 1
                        continue

                    to_create_map_stats.append(MetaMapStats(
                        brawler=brawler_obj,
                        map=map_obj,
                        win_rate=win_rate,
                        pick_rate=pick_rate,
                        category=category,
                        trophy_range=trophy_range,
                        tier=1  # Map-specific is Tier 1
                    ))
            
            if to_create_map_stats:
                MetaMapStats.objects.bulk_create(to_create_map_stats, batch_size=999)
                map_stats_updated = len(to_create_map_stats)

        self.stdout.write(self.style.SUCCESS(
            f"Successfully ingested {map_stats_updated} map brawler stats. "
            f"({maps_skipped} maps skipped, {brawlers_skipped} brawler entries skipped)"
        ))

        self.stdout.write(self.style.SUCCESS("Meta statistics ingestion completed successfully!"))
