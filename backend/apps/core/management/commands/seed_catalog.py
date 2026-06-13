import requests
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from apps.core.models import Brawler, Map

class Command(BaseCommand):
    help = "Seeds/Refreshes the brawler and map catalogs from api.brawlify.com"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting catalog seed from api.brawlify.com..."))

        headers = {
            "Accept": "application/json"
        }

        CLASS_NAME_OVERRIDES = {
            "16000088": "Assassin",       # Buzz Lightyear
            "16000089": "Controller",     # Meeple
            "16000090": "Tank",           # Ollie
            "16000092": "Controller",     # Finx
            "16000093": "Support",        # Jae-Yong
            "16000094": "Assassin",       # Kaze
            "16000095": "Damage Dealer",  # Alli
            "16000096": "Tank",           # Trunk
            "16000097": "Damage Dealer",  # Mina
            "16000098": "Controller",     # Ziggy
            "16000099": "Marksman",       # Pierce
            "16000100": "Assassin",       # Gigi
            "16000101": "Support",        # Glowy
            "16000102": "Controller",     # Sirius
            "16000103": "Damage Dealer",  # Najia
            "16000104": "Tank",           # Damian
            "16000105": "Assassin",       # Starr Nova
            "16000106": "Damage Dealer",  # Bolt
        }

        # 1. Seed Brawlers
        self.stdout.write(self.style.NOTICE("Fetching brawlers catalog..."))
        try:
            brawlers_res = requests.get("https://api.brawlify.com/v1/brawlers", headers=headers, timeout=15)
            if brawlers_res.status_code != 200:
                raise CommandError(f"Brawlify API returned status code {brawlers_res.status_code} for brawlers.")
            
            brawlers_data = brawlers_res.json()
            brawler_list = brawlers_data.get("list", [])
            self.stdout.write(self.style.NOTICE(f"Retrieved {len(brawler_list)} brawlers. Ingesting..."))
            
            brawlers_saved = 0
            with transaction.atomic():
                for item in brawler_list:
                    brawler_id = str(item["id"])
                    
                    # Ignore custom/fictional brawlers (ID >= 16000088)
                    try:
                        if int(brawler_id) >= 16000088:
                            continue
                    except ValueError:
                        pass

                    name = item.get("name", "Unknown")
                    image_url = item.get("imageUrl", "")
                    class_info = item.get("class", {})
                    class_name = class_info.get("name", "Unknown") if isinstance(class_info, dict) else "Unknown"

                    if brawler_id in CLASS_NAME_OVERRIDES:
                        class_name = CLASS_NAME_OVERRIDES[brawler_id]

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
            maps_res = requests.get("https://api.brawlify.com/v1/maps", headers=headers, timeout=15)
            if maps_res.status_code != 200:
                raise CommandError(f"Brawlify API returned status code {maps_res.status_code} for maps.")
            
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

