from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Q
from apps.core.models import Player
from apps.matches.utils import ingest_player_matches

class Command(BaseCommand):
    help = "Syncs matches for players whose adaptive sync window has elapsed"

    def add_arguments(self, parser):
        parser.add_argument('--sleep', type=float, default=1.5, help='Seconds to sleep between API calls')

    def handle(self, *args, **options):
        sleep_secs = options['sleep']
        now = timezone.now()
        due = Player.objects.filter(
            Q(last_sync_at__isnull=True) | Q(last_sync_at__lte=now - timedelta(hours=1)),
            player_tag__isnull=False,
        ).exclude(player_tag__exact='')

        # Second pass: check exact interval
        due = [p for p in due if p.last_sync_at is None or
               (now - p.last_sync_at).total_seconds() / 3600 >= p.sync_interval_h]

        self.stdout.write(self.style.NOTICE(f"Found {len(due)} player(s) due for sync"))

        import time
        total = 0
        for player in due:
            try:
                count = ingest_player_matches(player)
                total += count
                self.stdout.write(self.style.SUCCESS(
                    f"Synced {count} match(es) for '{player.name}' ({player.player_tag}) "
                    f"[next in {player.sync_interval_h:.1f}h]"
                ))
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"Failed to sync '{player.name}': {e}"
                ))
            time.sleep(sleep_secs)

        self.stdout.write(self.style.SUCCESS(f"Done. Total new matches: {total}"))
