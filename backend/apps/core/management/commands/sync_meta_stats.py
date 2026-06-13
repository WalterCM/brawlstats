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

        # ----------------------------------------------------------------
        # 1. Load active ranked map pool from JSON file (map name -> mode)
        # ----------------------------------------------------------------
        pool_file = os.path.join(current_dir, "ranked_map_pool.json")
        if not os.path.exists(pool_file):
            self.stdout.write(self.style.ERROR(f"Ranked map pool file not found at {pool_file}"))
            return

        with open(pool_file, "r") as f:
            ranked_pool = json.load(f)

        self.stdout.write(self.style.NOTICE(f"Loaded {len(ranked_pool)} maps from ranked pool configuration."))

        updated_ranked_count = 0
        with transaction.atomic():
            Map.objects.all().update(is_ranked=False)
            for map_name, map_mode in ranked_pool.items():
                matching_maps = Map.objects.filter(name__iexact=map_name, mode__iexact=map_mode).order_by('id')
                if not matching_maps.exists():
                    matching_maps = Map.objects.filter(name__iexact=map_name).order_by('id')
                canonical_map = matching_maps.first()
                if canonical_map:
                    canonical_map.is_ranked = True
                    canonical_map.save()
                    updated_ranked_count += 1
                else:
                    self.stdout.write(self.style.WARNING(
                        f"Could not find any database map for: {map_name} ({map_mode})"
                    ))

        self.stdout.write(self.style.SUCCESS(
            f"Updated maps in DB: tagged {updated_ranked_count} canonical maps as is_ranked=True."
        ))

        # ----------------------------------------------------------------
        # 2. Build lookup caches (name → object) for efficient matching
        # ----------------------------------------------------------------
        brawler_cache: dict[str, Brawler] = {
            b.name.lower(): b for b in Brawler.objects.all()
        }
        map_cache: dict[str, Map] = {
            m.name.lower(): m for m in Map.objects.all().order_by('is_ranked', 'id')
        }
        self.stdout.write(self.style.NOTICE(
            f"Caches built: {len(brawler_cache)} brawlers, {len(map_cache)} maps."
        ))

        def resolve_brawler(entry: dict) -> Brawler | None:
            """Resolves a brawler from an entry using id (legacy) or name (BrawlPlanet)."""
            brawler_id = entry.get("brawler_id")
            if brawler_id:
                try:
                    return Brawler.objects.get(id=str(brawler_id))
                except Brawler.DoesNotExist:
                    pass
            raw_name = entry.get("brawler_name") or ""
            name = html_lib.unescape(raw_name.strip()).lower()
            return brawler_cache.get(name)

        def resolve_map(entry: dict) -> Map | None:
            """Resolves a map from an entry using id (legacy) or name (BrawlPlanet)."""
            map_id = entry.get("map_id")
            if map_id:
                try:
                    return Map.objects.get(id=str(map_id))
                except Map.DoesNotExist:
                    pass
            raw_name = entry.get("map_name") or ""
            name = html_lib.unescape(raw_name.strip()).lower()
            return map_cache.get(name)

        # ----------------------------------------------------------------
        # 3. Ingest Global Brawler Stats
        # ----------------------------------------------------------------
        global_file = os.path.join(current_dir, "brawlers_global_stats.json")
        if not os.path.exists(global_file):
            self.stdout.write(self.style.WARNING(
                f"Global stats file not found at {global_file}. Skipping global stats ingestion."
            ))
        else:
            self.stdout.write(self.style.NOTICE(f"Reading global stats from {global_file}..."))
            with open(global_file, "r") as f:
                global_data = json.load(f)

            brawlers_updated = 0
            skipped = 0
            with transaction.atomic():
                MetaBrawlerStats.objects.filter(date=timezone.now().date()).delete()

                for entry in global_data:
                    win_rate = float(entry.get("win_rate", 0.5))
                    pick_rate = float(entry.get("pick_rate", 0.0))

                    brawler_obj = resolve_brawler(entry)
                    if not brawler_obj:
                        name = entry.get("brawler_name", entry.get("brawler_id", "?"))
                        self.stdout.write(self.style.WARNING(
                            f"Brawler '{name}' not found in database. Skipping."
                        ))
                        skipped += 1
                        continue

                    MetaBrawlerStats.objects.create(
                        brawler=brawler_obj,
                        win_rate=win_rate,
                        pick_rate=pick_rate,
                        tier=2  # Global fallback is Tier 2
                    )
                    brawlers_updated += 1

            self.stdout.write(self.style.SUCCESS(
                f"Successfully ingested {brawlers_updated} global brawler meta stats. "
                f"({skipped} skipped)"
            ))

        # ----------------------------------------------------------------
        # 4. Ingest Map-Specific Stats
        # ----------------------------------------------------------------
        maps_file = os.path.join(current_dir, "maps_tiered_stats.json")
        if not os.path.exists(maps_file):
            self.stdout.write(self.style.WARNING(
                f"Map stats file not found at {maps_file}. Skipping map stats ingestion."
            ))
        else:
            self.stdout.write(self.style.NOTICE(f"Reading map-specific stats from {maps_file}..."))
            with open(maps_file, "r") as f:
                maps_data = json.load(f)

            map_stats_updated = 0
            maps_skipped = 0
            brawlers_skipped = 0
            with transaction.atomic():
                for map_entry in maps_data:
                    trophy_range = map_entry.get("trophy_range", "1000+")
                    stats = map_entry.get("stats", [])

                    map_obj = resolve_map(map_entry)
                    if not map_obj:
                        name = map_entry.get("map_name", map_entry.get("map_id", "?"))
                        self.stdout.write(self.style.WARNING(
                            f"Map '{name}' not found in database. Skipping."
                        ))
                        maps_skipped += 1
                        continue

                    # Clear existing entries for this map/date/trophy_range
                    MetaMapStats.objects.filter(
                        map=map_obj,
                        date=timezone.now().date(),
                        trophy_range=trophy_range
                    ).delete()

                    for entry in stats:
                        win_rate = float(entry.get("win_rate", 0.5))
                        pick_rate = float(entry.get("pick_rate", 0.0))
                        category = entry.get("category", "best_pick")

                        brawler_obj = resolve_brawler(entry)
                        if not brawler_obj:
                            brawlers_skipped += 1
                            continue

                        MetaMapStats.objects.create(
                            brawler=brawler_obj,
                            map=map_obj,
                            win_rate=win_rate,
                            pick_rate=pick_rate,
                            category=category,
                            trophy_range=trophy_range,
                            tier=1  # Map-specific is Tier 1
                        )
                        map_stats_updated += 1

            self.stdout.write(self.style.SUCCESS(
                f"Successfully ingested {map_stats_updated} map brawler stats. "
                f"({maps_skipped} maps skipped, {brawlers_skipped} brawler entries skipped)"
            ))

        self.stdout.write(self.style.SUCCESS("Meta statistics ingestion completed successfully!"))
