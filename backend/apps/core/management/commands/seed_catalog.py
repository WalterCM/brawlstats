import requests
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.core.models import Brawler, Map

class Command(BaseCommand):
    help = "Seeds/Refreshes the brawler and map catalogs from brawlapi.com"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting catalog seed from brawlapi.com..."))

        headers = {
            "Accept": "application/json"
        }

        # 1. Seed Brawlers
        self.stdout.write(self.style.NOTICE("Fetching brawlers catalog..."))
        try:
            brawlers_res = requests.get("https://api.brawlapi.com/v1/brawlers", headers=headers, timeout=15)
            if brawlers_res.status_code != 200:
                raise CommandError(f"BrawlAPI returned status code {brawlers_res.status_code} for brawlers.")
            
            brawlers_data = brawlers_res.json()
            brawler_list = brawlers_data.get("list", [])
            self.stdout.write(self.style.NOTICE(f"Retrieved {len(brawler_list)} brawlers. Ingesting..."))
            
            brawlers_saved = 0
            with transaction.atomic():
                for item in brawler_list:
                    brawler_id = str(item["id"])
                    name = item.get("name", "Unknown")
                    image_url = item.get("imageUrl", "")
                    class_info = item.get("class", {})
                    class_name = class_info.get("name", "Unknown") if isinstance(class_info, dict) else "Unknown"

                    brawler, created = Brawler.objects.update_or_create(
                        id=brawler_id,
                        defaults={
                            "name": name,
                            "image_url": image_url,
                            "class_name": class_name
                        }
                    )
                    brawlers_saved += 1
            
            self.stdout.write(self.style.SUCCESS(f"Successfully synced {brawlers_saved} brawlers in the catalog."))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error seeding brawlers: {str(e)}"))

        # 2. Seed Maps
        self.stdout.write(self.style.NOTICE("Fetching maps catalog..."))
        try:
            maps_res = requests.get("https://api.brawlapi.com/v1/maps", headers=headers, timeout=15)
            if maps_res.status_code != 200:
                raise CommandError(f"BrawlAPI returned status code {maps_res.status_code} for maps.")
            
            maps_data = maps_res.json()
            map_list = maps_data.get("list", [])
            self.stdout.write(self.style.NOTICE(f"Retrieved {len(map_list)} maps. Ingesting..."))

            maps_saved = 0
            with transaction.atomic():
                for item in map_list:
                    map_id = str(item["id"])
                    name = item.get("name", "Unknown Map")
                    image_url = item.get("imageUrl", "")
                    game_mode = item.get("gameMode", {})
                    mode_name = game_mode.get("name", "Unknown Mode") if isinstance(game_mode, dict) else "Unknown Mode"
                    
                    is_disabled = item.get("disabled", False)
                    is_ranked = not is_disabled

                    map_obj, created = Map.objects.update_or_create(
                        id=map_id,
                        defaults={
                            "name": name,
                            "mode": mode_name,
                            "image_url": image_url,
                            "is_ranked": is_ranked
                        }
                    )
                    maps_saved += 1
            
            self.stdout.write(self.style.SUCCESS(f"Successfully synced {maps_saved} maps in the catalog."))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error seeding maps: {str(e)}"))

        self.stdout.write(self.style.SUCCESS("Catalog seed completed successfully!"))
