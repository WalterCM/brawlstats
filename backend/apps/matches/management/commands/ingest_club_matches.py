from django.core.management.base import BaseCommand
from apps.clubs.models import ClubMember
from apps.matches.utils import ingest_player_matches

class Command(BaseCommand):
    help = "Ingests recent matches for all active club members from the Brawl Stars API"

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("Starting club matches ingestion..."))

        active_members = ClubMember.objects.filter(is_active=True, is_approved=True).select_related('player')
        players = {member.player for member in active_members if member.player}

        self.stdout.write(self.style.NOTICE(f"Found {len(players)} active players to sync..."))

        total_synced = 0
        for player in players:
            if not player.player_tag:
                self.stdout.write(self.style.WARNING(f"Skipping player '{player.name}': No player tag configured."))
                continue

            try:
                synced_count = ingest_player_matches(player)
                self.stdout.write(self.style.SUCCESS(
                    f"Successfully synced {synced_count} matches for '{player.name}' ({player.player_tag})"
                ))
                total_synced += synced_count
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"Error syncing matches for player '{player.name}': {str(e)}"
                ))

        self.stdout.write(self.style.SUCCESS(f"Club matches ingestion finished. Total matches synced: {total_synced}"))
