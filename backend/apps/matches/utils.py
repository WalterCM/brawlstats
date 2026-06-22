import re
import os
import requests
from django.db import transaction
from apps.core.models import Map, Brawler
from apps.matches.models import Match, DraftEvent
from apps.drafting.views import resolve_battle_teams

def ingest_player_matches(player):
    api_key = os.getenv('BRAWL_STARS_API_KEY')
    player_tag = player.player_tag or os.getenv('BRAWL_STARS_PLAYER_TAG')

    if not api_key:
        raise ValueError("BRAWL_STARS_API_KEY is not configured in the backend environment.")
    if not player_tag:
        raise ValueError("Please configure your Player Tag in your Profile page before syncing.")

    encoded_tag = player_tag.replace('#', '%23')
    url = f"https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
    headers = {"Authorization": f"Bearer {api_key}"}

    res = requests.get(url, headers=headers, timeout=10)
    if res.status_code != 200:
        raise ValueError(f"Failed to fetch battle log from Brawl Stars API: {res.text}")

    data = res.json()
    items = data.get('items', [])
    if not items:
        return 0

    synced_count = 0
    normalized_player_tag = player_tag.replace('#', '').upper()
    allowed_modes = {'gemgrab', 'brawlball', 'heist', 'hotzone', 'knockout', 'bounty'}

    for item in reversed(items):
        battle = item.get('battle', {})
        teams = battle.get('teams', [])
        
        if not teams or len(teams) != 2 or len(teams[0]) != 3 or len(teams[1]) != 3:
            continue

        battle_time = item.get('battleTime')
        if not battle_time:
            continue

        if Match.objects.filter(player=player, api_match_id=battle_time).exists():
            continue

        event = item.get('event', {})
        map_name = event.get('map')
        if not map_name:
            continue

        allied_team = None
        enemy_team = None
        my_brawler_api = None

        for t_idx, team_players in enumerate(teams):
            for p in team_players:
                p_tag = p.get('tag', '').replace('#', '').upper()
                if p_tag == normalized_player_tag:
                    allied_team = team_players
                    enemy_team = teams[1 - t_idx]
                    my_brawler_api = p.get('brawler')
                    break
            if allied_team:
                break

        if not allied_team or not my_brawler_api:
            continue

        clean_name = re.sub(r"['`\u2018\u2019\u201a\u201b\u2032]", "", map_name)
        if clean_name != map_name:
            db_map = Map.objects.filter(name__iexact=clean_name).first()
        else:
            db_map = Map.objects.filter(name__iexact=map_name).first()
        if not db_map:
            db_map = Map.objects.filter(name__icontains=clean_name if clean_name != map_name else map_name).first()
        if not db_map:
            continue

        normalized_mode = db_map.mode.lower().replace(' ', '').replace('_', '').replace('-', '')
        if normalized_mode not in allowed_modes:
            continue

        my_brawler_id = str(my_brawler_api.get('id'))
        my_brawler = Brawler.objects.filter(id=my_brawler_id).first()
        if not my_brawler:
            my_brawler = Brawler.objects.filter(name__iexact=my_brawler_api.get('name')).first()
        if not my_brawler:
            continue

        raw_result = battle.get('result', 'defeat')
        result = 'victory' if raw_result == 'victory' else 'defeat'
        
        battle_type = battle.get('type', '')
        if battle_type:
            draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
        else:
            draft_type = 'ranked' if db_map.is_ranked else 'normal'

        my_brawler_trophies = my_brawler_api.get('trophies', 0) or 0
        star_player_api = battle.get('starPlayer')
        star_player_tag = star_player_api.get('tag', '') if star_player_api else ''
        is_star_player = star_player_tag.replace('#', '').upper() == normalized_player_tag

        with transaction.atomic():
            match = Match.objects.create(
                player=player,
                map=db_map,
                my_brawler=my_brawler,
                mode=db_map.mode,
                result=result,
                draft_type=draft_type,
                api_match_id=battle_time,
                my_brawler_trophies=my_brawler_trophies,
                is_star_player=is_star_player
            )

            order = 0
            def create_pick(player_data, team_name):
                nonlocal order
                b_api = player_data.get('brawler', {})
                b_id = str(b_api.get('id'))
                b_obj = Brawler.objects.filter(id=b_id).first()
                if not b_obj:
                    b_obj = Brawler.objects.filter(name__iexact=b_api.get('name')).first()
                if b_obj:
                    DraftEvent.objects.create(
                        match=match,
                        type='pick',
                        brawler=b_obj,
                        team=team_name,
                        order=order
                    )
                    order += 1

            for p in allied_team:
                create_pick(p, 'allied')
            for p in enemy_team:
                create_pick(p, 'enemy')

        synced_count += 1

    return synced_count
