from django.db import migrations, models
from django.db.models import Count


def deduplicate_matches(apps, schema_editor):
    Match = apps.get_model('matches', 'Match')
    dups = Match.objects.values('player_id', 'api_match_id').annotate(cnt=Count('id')).filter(cnt__gt=1, api_match_id__isnull=False)
    for d in dups:
        ids = Match.objects.filter(
            player_id=d['player_id'],
            api_match_id=d['api_match_id']
        ).values_list('id', flat=True).order_by('id')
        ids_to_delete = list(ids[1:])
        Match.objects.filter(id__in=ids_to_delete).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_player_min_normal_trophies'),
        ('matches', '0007_match_matches_mat_player__fc0753_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(deduplicate_matches, reverse_code=migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='match',
            constraint=models.UniqueConstraint(condition=models.Q(('api_match_id__isnull', False)), fields=('player', 'api_match_id'), name='unique_player_match'),
        ),
    ]
