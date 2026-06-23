import math
import re
from rest_framework import viewsets, views, response, status
from apps.core.models import Brawler, Map
from apps.core.serializers import BrawlerSerializer
from apps.core.permissions import IsSupabaseAuthenticated
from apps.drafting.models import Perception
from apps.drafting.serializers import PerceptionSerializer
from apps.brawlers.models import MetaBrawlerStats, MetaMatchup, MetaMapStats
from apps.matches.models import Match, DraftEvent

class PerceptionViewSet(viewsets.ModelViewSet):
    serializer_class = PerceptionSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def get_queryset(self):
        request_player = self.request.player
        target_player_id = self.request.query_params.get('player_id')
        
        if target_player_id and str(target_player_id) != str(request_player.id):
            user = self.request.user
            is_site_admin = user and (user.is_staff or user.is_superuser)
            if is_site_admin:
                return Perception.objects.filter(player_id=target_player_id).order_by('-date')
            try:
                from apps.clubs.models import ClubMember
                my_membership = request_player.club_membership
                target_membership = ClubMember.objects.get(player_id=target_player_id)
                if (my_membership.club_id == target_membership.club_id and 
                    my_membership.is_approved and my_membership.is_active and
                    target_membership.is_approved and target_membership.is_active):
                    return Perception.objects.filter(player_id=target_player_id).order_by('-date')
            except (AttributeError, ClubMember.DoesNotExist):
                pass
            return Perception.objects.none()

        return Perception.objects.filter(player=request_player).order_by('-date')


class DraftSuggestionView(views.APIView):
    permission_classes = [IsSupabaseAuthenticated]

    def post(self, request):
        player = request.player
        data = request.data
        
        map_id = data.get('map_id')
        allies_picked = data.get('allies_picked', [])
        enemies_picked = data.get('enemies_picked', [])
        allies_banned = data.get('allies_banned', [])
        enemies_banned = data.get('enemies_banned', [])

        enable_turns = data.get('enable_turns', True)
        active_team = data.get('active_team', 'allied')
        draft_type = data.get('draft_type', 'ranked')

        if not map_id:
            return response.Response({"error": "map_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Exclude brawlers that are picked or banned during draft
        if draft_type == 'normal':
            excluded_ids = set()
        elif enable_turns:
            excluded_ids = set(allies_picked + enemies_picked + allies_banned + enemies_banned)
        else:
            # If turns are disabled (simultaneous picks), team picks do not block each other
            if active_team == 'enemy':
                excluded_ids = set(enemies_picked + allies_banned + enemies_banned)
            else:
                excluded_ids = set(allies_picked + allies_banned + enemies_banned)
        
        try:
            target_map = Map.objects.get(id=map_id)
        except Map.DoesNotExist:
            return response.Response({"error": "Map not found"}, status=status.HTTP_404_NOT_FOUND)

        # Retrieve dynamic min_trophies filter (default 1000)
        min_trophies = data.get('min_trophies', 1000)
        if min_trophies is None or min_trophies == '':
            min_trophies = 1000
        else:
            try:
                min_trophies = int(min_trophies)
            except ValueError:
                min_trophies = 1000

        from django.db.models import Q
        trophy_filter = Q(draft_type='ranked') | Q(draft_type='normal', my_brawler_trophies__gte=min_trophies) | Q(draft_type='normal', my_brawler_trophies__isnull=True)

        brawlers = Brawler.objects.exclude(id__in=excluded_ids)
        total_map_matches = Match.objects.filter(player=player, map=target_map).filter(trophy_filter).count()
        suggestions = []

        for b in brawlers:
            # --- 1. Component A: Adjusted Win Rate (Bayesian Beta Smoothing) ---
            personal_matches = Match.objects.filter(player=player, map=target_map, my_brawler=b).filter(trophy_filter)
            games_player = personal_matches.count()
            wins_player = personal_matches.filter(result='victory').count()

            # Global Meta map win rate (fallback to global meta stats, fallback to 0.5)
            try:
                # Prioritize 'Diamond I+' trophy range (Ranked/Power League) and take the latest entry by date
                meta_map = MetaMapStats.objects.filter(brawler=b, map=target_map, trophy_range='Diamond I+').latest('date')
                win_rate_meta = meta_map.win_rate
                pick_rate_meta = meta_map.pick_rate
            except MetaMapStats.DoesNotExist:
                try:
                    # Fallback to '1000+'
                    meta_map = MetaMapStats.objects.filter(brawler=b, map=target_map, trophy_range='1000+').latest('date')
                    win_rate_meta = meta_map.win_rate
                    pick_rate_meta = meta_map.pick_rate
                except MetaMapStats.DoesNotExist:
                    try:
                        # Fallback to any other trophy range if not found
                        meta_map = MetaMapStats.objects.filter(brawler=b, map=target_map).latest('date')
                        win_rate_meta = meta_map.win_rate
                        pick_rate_meta = meta_map.pick_rate
                    except MetaMapStats.DoesNotExist:
                        try:
                            # Fallback to global brawler stats with reduced weight of 0.6
                            meta_brawler = MetaBrawlerStats.objects.filter(brawler=b).latest('date')
                            win_rate_meta = meta_brawler.win_rate * 0.6
                            pick_rate_meta = meta_brawler.pick_rate
                        except MetaBrawlerStats.DoesNotExist:
                            win_rate_meta = 0.5 * 0.6
                            pick_rate_meta = 0.01

            k_prior = 8.0
            alpha_prior = win_rate_meta * k_prior
            beta_prior = (1.0 - win_rate_meta) * k_prior

            score_a = (wins_player + alpha_prior) / (games_player + alpha_prior + beta_prior)

            # --- 2. Component B: Matchup Factor ---
            score_b = 1.0
            for enemy_id in enemies_picked:
                try:
                    enemy = Brawler.objects.get(id=enemy_id)
                except Brawler.DoesNotExist:
                    continue

                # Count total matches played as 'b' against 'enemy' (used as the denominator)
                from django.db.models import Q
                match_query = Match.objects.filter(
                    player=player,
                    my_brawler=b
                ).filter(trophy_filter).filter(
                    Q(draft_events__brawler=enemy, draft_events__team='enemy', draft_events__type='pick') |
                    Q(perceptions__brawler_rival=enemy)
                )
                if target_map.mode:
                    match_query = match_query.filter(mode=target_map.mode)
                
                games_count = match_query.distinct().count()

                # Sum the comfort level ratings (perceptions) for this matchup
                perceptions = Perception.objects.filter(player=player, my_brawler=b, brawler_rival=enemy).filter(
                    Q(match__draft_type='ranked') | Q(match__draft_type='normal', match__my_brawler_trophies__gte=min_trophies) | Q(match__draft_type='normal', match__my_brawler_trophies__isnull=True)
                )
                if target_map.mode:
                    perceptions = perceptions.filter(match__mode=target_map.mode)

                # Fetch meta matchup win rate for fallback/prior
                try:
                    m_match = MetaMatchup.objects.get(brawler_a=b, brawler_b=enemy)
                    meta_matchup_wr = m_match.win_rate_a
                except MetaMatchup.DoesNotExist:
                    meta_matchup_wr = 0.5

                if perceptions.exists():
                    from django.db.models import Sum
                    sum_value = perceptions.aggregate(Sum('value'))['value__sum'] or 0
                    avg_value = sum_value / perceptions.count()
                    
                    # Linear interpolation for rating (from -2.0 to 1.0)
                    # -2.0 -> 0.65 (hard counter)
                    # -1.0 -> 0.85 (hard)
                    #  0.0 -> 1.00 (neutral)
                    #  1.0 -> 1.15 (easy)
                    if avg_value <= -1.0:
                        factor = 0.85 + (avg_value - (-1.0)) * 0.20
                    else:
                        factor = 1.00 + avg_value * 0.15
                elif games_count > 0:
                    # No perceptions, but have played matches -> Bayesian smoothed win rate against this enemy
                    wins_count = match_query.filter(result='victory').count()
                    k_match_prior = 5.0
                    alpha_match_prior = meta_matchup_wr * k_match_prior
                    smoothed_match_wr = (wins_count + alpha_match_prior) / (games_count + k_match_prior)
                    factor = smoothed_match_wr / 0.5
                else:
                    # No perceptions and no games -> Meta matchup fallback
                    factor = meta_matchup_wr / 0.5
                
                score_b *= factor

            # --- 3. Component C: Synergy Factor ---
            synergy_factors = []
            for ally_id in allies_picked:
                try:
                    ally = Brawler.objects.get(id=ally_id)
                except Brawler.DoesNotExist:
                    continue

                # Query matches where you played 'b' and teammate played 'ally'
                synergy_matches = Match.objects.filter(
                    player=player, 
                    my_brawler=b,
                    draft_events__brawler=ally,
                    draft_events__team='allied'
                ).filter(trophy_filter).distinct()
                
                games_synergy = synergy_matches.count()
                wins_synergy = synergy_matches.filter(result='victory').count()

                if games_synergy >= 5:
                    alpha_syn = 2.5
                    beta_syn = 2.5
                    syn_rate = (wins_synergy + alpha_syn) / (games_synergy + alpha_syn + beta_syn)
                    factor = syn_rate / 0.5
                else:
                    factor = 1.0
                
                synergy_factors.append(factor)

            if synergy_factors:
                score_c = sum(synergy_factors) / len(synergy_factors)
            else:
                score_c = 1.0

            # --- 4. Component E: Confidence Penalty ---
            score_e = 1.0 - 0.2 * math.exp(-games_player / 5.0)

            # --- 5. Bayesian Pick Rate Smoothing with Damping Anchor ---
            k_pick_prior = 20.0
            raw_effective_pr = (games_player + pick_rate_meta * k_pick_prior) / (total_map_matches + k_pick_prior)
            # Blend 80% effective pick rate with 20% global meta to keep a baseline anchor/damping
            effective_pick_rate = 0.8 * raw_effective_pr + 0.2 * pick_rate_meta

            # Combined Suggestion Score using the new formula with smooth pick rate penalty (scale = 0.005)
            pr_multiplier = 1.0 - math.exp(-effective_pick_rate / 0.005) if effective_pick_rate > 0 else 0.0
            combined_score = (score_a * score_b * score_c * score_e * pr_multiplier) + (0.15 * effective_pick_rate)

            suggestions.append({
                "brawler": BrawlerSerializer(b).data,
                "score": round(combined_score, 4),
                "components": {
                    "A_adjusted_win_rate": round(score_a, 4),
                    "B_matchup_factor": round(score_b, 4),
                    "C_synergy_factor": round(score_c, 4),
                    "D_meta_relevance": round(effective_pick_rate, 4),
                    "E_confidence_penalty": round(score_e, 4)
                }
            })

        # Order recommendations descending by final score
        suggestions = sorted(suggestions, key=lambda x: x["score"], reverse=True)

        return response.Response({
            "map_id": map_id,
            "suggestions": suggestions[:15]  # Top 15 suggestions
        })


def resolve_battle_teams(battle, normalized_player_tag):
    teams = battle.get('teams', [])
    allied_team = None
    enemy_team = None
    my_brawler_data = None

    for team_idx, team_players in enumerate(teams):
        for p in team_players:
            p_tag = p.get('tag', '').replace('#', '').upper()
            if p_tag == normalized_player_tag:
                allied_team = team_players
                enemy_team = teams[1 - team_idx]
                my_brawler_data = p.get('brawler')
                break
        if allied_team:
            break

    return allied_team, enemy_team, my_brawler_data


def get_brawler_or_serialize(brawler_api_data):
    if not brawler_api_data:
        return None
    b_id = str(brawler_api_data.get('id'))
    db_brawler = Brawler.objects.filter(id=b_id).first()
    if not db_brawler:
        db_brawler = Brawler.objects.filter(name__iexact=brawler_api_data.get('name')).first()
    if db_brawler:
        return BrawlerSerializer(db_brawler).data
    return {
        "id": b_id,
        "name": brawler_api_data.get('name', 'Unknown'),
        "image_url": ""
    }


def parse_battle_time(t_str):
    from datetime import datetime
    try:
        return datetime.strptime(t_str.split('.')[0], "%Y%m%dT%H%M%S")
    except Exception:
        return None


def group_ranked_sets(items, target_item, db_map, normalized_player_tag):
    target_battle = target_item.get('battle', {})
    target_allied, target_enemy, _ = resolve_battle_teams(target_battle, normalized_player_tag)
    if not target_allied or not target_enemy:
        return [target_item]

    target_allies_brawler_ids = sorted([str(p.get('brawler', {}).get('id')) for p in target_allied])
    target_enemies_brawler_ids = sorted([str(p.get('brawler', {}).get('id')) for p in target_enemy])

    target_time = parse_battle_time(target_item.get('battleTime', ''))
    if not target_time:
        return [target_item]

    series = []
    for item in items:
        battle = item.get('battle', {})
        b_type = battle.get('type', '')
        if b_type not in ('soloRanked', 'teamRanked'):
            continue

        event = item.get('event', {})
        map_name = event.get('map')
        clean_api = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', (map_name or '')).strip().lower()
        clean_db = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', db_map.name).strip().lower()
        if not map_name or clean_api != clean_db:
            continue

        allied_team, enemy_team, _ = resolve_battle_teams(battle, normalized_player_tag)
        if not allied_team or not enemy_team:
            continue

        allies_brawler_ids = sorted([str(p.get('brawler', {}).get('id')) for p in allied_team])
        enemies_brawler_ids = sorted([str(p.get('brawler', {}).get('id')) for p in enemy_team])

        if allies_brawler_ids == target_allies_brawler_ids and enemies_brawler_ids == target_enemies_brawler_ids:
            item_time = parse_battle_time(item.get('battleTime', ''))
            if item_time and abs((item_time - target_time).total_seconds()) < 600:
                series.append(item)

    series.sort(key=lambda x: x.get('battleTime', ''))
    return series


def serialize_set_data(item, normalized_player_tag):
    battle = item.get('battle', {})
    _, _, my_brawler_data = resolve_battle_teams(battle, normalized_player_tag)
    raw_result = battle.get('result', 'defeat')
    result = 'victory' if raw_result == 'victory' else 'defeat'
    my_brawler_trophies = my_brawler_data.get('trophies', 0) if my_brawler_data else 0
    star_player_api = battle.get('starPlayer')
    star_player_tag = star_player_api.get('tag', '') if star_player_api else ''
    is_star_player = star_player_tag.replace('#', '').upper() == normalized_player_tag

    return {
        "api_match_id": item.get('battleTime'),
        "result": result,
        "my_brawler_trophies": my_brawler_trophies,
        "is_star_player": is_star_player
    }


class LastBattleIngestView(views.APIView):
    permission_classes = [IsSupabaseAuthenticated]

    def get(self, request):
        import os
        import requests

        api_key = os.getenv('BRAWL_STARS_API_KEY')
        player_tag = request.player.player_tag or os.getenv('BRAWL_STARS_PLAYER_TAG')

        if not api_key:
            return response.Response(
                {"error": "BRAWL_STARS_API_KEY is not configured in the backend environment."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not player_tag:
            return response.Response(
                {"error": "Please configure your Player Tag in your Profile page before ingesting battles."},
                status=status.HTTP_400_BAD_REQUEST
            )

        encoded_tag = player_tag.replace('#', '%23')
        normalized_player_tag = player_tag.replace('#', '').upper()
        url = f"https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }

        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return response.Response(
                    {"error": f"Failed to fetch battle log from Brawl Stars API: {res.text}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            data = res.json()
            items = data.get('items', [])
            if not items:
                return response.Response(
                    {"error": "No battles found in player's battle log."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Find the first 3v3 team battle belonging to an allowed mode that passes the user's filters
            target_battle_item = None
            db_map = None
            allowed_modes = {'gemgrab', 'brawlball', 'heist', 'hotzone', 'knockout', 'bounty'}
            has_any_competitive = False

            for item in items:
                battle = item.get('battle', {})
                if 'teams' in battle and len(battle['teams']) == 2 and len(battle['teams'][0]) == 3 and len(battle['teams'][1]) == 3:
                    event = item.get('event', {})
                    map_name = event.get('map')
                    if map_name:
                        clean_name = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', map_name)
                        if clean_name != map_name:
                            candidate_map = Map.objects.filter(name__iexact=clean_name).first()
                        else:
                            candidate_map = Map.objects.filter(name__iexact=map_name).first()
                        if not candidate_map:
                            candidate_map = Map.objects.filter(name__icontains=clean_name if clean_name != map_name else map_name).first()
                        if candidate_map:
                            normalized_mode = candidate_map.mode.lower().replace(' ', '').replace('_', '').replace('-', '')
                            if normalized_mode in allowed_modes:
                                allied_team, enemy_team, my_brawler_api = resolve_battle_teams(battle, normalized_player_tag)
                                if not allied_team or not my_brawler_api:
                                    continue

                                # Resolve draft type
                                battle_type = battle.get('type', '')
                                if battle_type:
                                    candidate_draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
                                else:
                                    candidate_draft_type = 'ranked' if candidate_map.is_ranked else 'normal'

                                

                                # Check normal filters - removed to ingest all battles

                                has_any_competitive = True

                                # Skip if this specific set/match is already recorded
                                battle_time = item.get('battleTime')
                                if battle_time and Match.objects.filter(player=request.player, api_match_id=battle_time).exists():
                                    continue

                                target_battle_item = item
                                db_map = candidate_map
                                break

            if not target_battle_item or not db_map:
                if has_any_competitive:
                    return response.Response(
                        {"error": "The latest competitive matches in your battle log are already recorded in Brawl Stats."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                return response.Response(
                    {"error": "No competitive 3v3 team battles found in the player's recent battle log."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Resolve draft type
            battle = target_battle_item.get('battle', {})
            battle_type = battle.get('type', '')
            if battle_type:
                draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
            else:
                draft_type = 'ranked' if db_map.is_ranked else 'normal'

            # Group sets
            if draft_type == 'ranked':
                series_items = group_ranked_sets(items, target_battle_item, db_map, normalized_player_tag)
            else:
                series_items = [target_battle_item]

            # Serialize team info from the target item
            allied_team, enemy_team, my_brawler_data = resolve_battle_teams(battle, normalized_player_tag)
            my_brawler_serialized = get_brawler_or_serialize(my_brawler_data)
            allies_serialized = [get_brawler_or_serialize(p.get('brawler')) for p in allied_team]
            enemies_serialized = [get_brawler_or_serialize(p.get('brawler')) for p in enemy_team]

            sets_serialized = [serialize_set_data(it, normalized_player_tag) for it in series_items]

            return response.Response({
                "map": {
                    "id": db_map.id,
                    "name": db_map.name,
                    "mode": db_map.mode,
                    "image_url": db_map.image_url,
                    "is_ranked": db_map.is_ranked
                },
                "my_brawler": my_brawler_serialized,
                "allies_picked": allies_serialized,
                "enemies_picked": enemies_serialized,
                "draft_type": draft_type,
                "sets": sets_serialized,
                "api_match_id": target_battle_item.get('battleTime'),
                "result": sets_serialized[0]['result'] if sets_serialized else 'victory',
                "my_brawler_trophies": sets_serialized[0]['my_brawler_trophies'] if sets_serialized else 0,
                "is_star_player": sets_serialized[0]['is_star_player'] if sets_serialized else False
            })

        except requests.RequestException as req_err:
            return response.Response(
                {"error": f"Brawl Stars API connection error or timeout. Please check your internet connection and ensure your API key matches your current IP address. Details: {str(req_err)}"},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            return response.Response(
                {"error": f"An error occurred while fetching last battle: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class LinkDraftBattleView(views.APIView):
    permission_classes = [IsSupabaseAuthenticated]

    def post(self, request):
        import os
        import requests

        api_key = os.getenv('BRAWL_STARS_API_KEY')
        player_tag = request.player.player_tag or os.getenv('BRAWL_STARS_PLAYER_TAG')

        if not api_key:
            return response.Response(
                {"error": "BRAWL_STARS_API_KEY is not configured in the backend environment."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not player_tag:
            return response.Response(
                {"error": "Please configure your Player Tag in your Profile page before linking drafts."},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = request.data
        map_id = data.get('map_id')
        my_brawler_id = str(data.get('my_brawler_id'))
        allies_picked = [str(aid) for aid in data.get('allies_picked', []) if aid]
        enemies_picked = [str(eid) for eid in data.get('enemies_picked', []) if eid]

        if not map_id or not my_brawler_id:
            return response.Response(
                {"error": "map_id and my_brawler_id are required fields."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            db_map = Map.objects.get(id=map_id)
        except Map.DoesNotExist:
            return response.Response(
                {"error": "Map not found."},
                status=status.HTTP_404_NOT_FOUND
            )

        encoded_tag = player_tag.replace('#', '%23')
        normalized_player_tag = player_tag.replace('#', '').upper()
        url = f"https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }

        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return response.Response(
                    {"error": f"Failed to fetch battle log from Brawl Stars API: {res.text}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            data = res.json()
            items = data.get('items', [])
            if not items:
                return response.Response(
                    {"error": "No battles found in player's battle log."},
                    status=status.HTTP_404_NOT_FOUND
                )

            target_battle_item = None
            has_matching_composition = False

            # Create sets of composition IDs to match regardless of pick order
            # Allies includes my brawler
            target_allies_set = set(allies_picked + [my_brawler_id])
            target_enemies_set = set(enemies_picked)

            for item in items:
                battle = item.get('battle', {})
                teams = battle.get('teams', [])
                if not teams or len(teams) != 2 or len(teams[0]) != 3 or len(teams[1]) != 3:
                    continue

                event = item.get('event', {})
                map_name = event.get('map')
                clean_api = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', (map_name or '')).strip().lower()
                clean_db = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', db_map.name).strip().lower()
                if not map_name or clean_api != clean_db:
                    continue

                allied_team, enemy_team, my_brawler_api = resolve_battle_teams(battle, normalized_player_tag)
                if not allied_team or not enemy_team or not my_brawler_api:
                    continue

                # Check if player played the expected brawler
                api_brawler_id = str(my_brawler_api.get('id'))
                if api_brawler_id != my_brawler_id:
                    continue

                # Verify full team compositions
                api_allies_set = set([str(p.get('brawler', {}).get('id')) for p in allied_team])
                api_enemies_set = set([str(p.get('brawler', {}).get('id')) for p in enemy_team])

                if api_allies_set == target_allies_set and api_enemies_set == target_enemies_set:
                    has_matching_composition = True

                    # Skip if this specific match set is already recorded
                    battle_time = item.get('battleTime')
                    if battle_time and Match.objects.filter(player=request.player, api_match_id=battle_time).exists():
                        continue

                    target_battle_item = item
                    break

            if not target_battle_item:
                if has_matching_composition:
                    return response.Response(
                        {"error": "The matches matching this composition in your battle log are already recorded in Brawl Stats."},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                return response.Response(
                    {"error": "Could not find any unlinked battle log entry matching this brawler composition and map."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Resolve draft type
            battle_type = target_battle_item.get('battle', {}).get('type', '')
            if battle_type:
                draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
            else:
                draft_type = 'ranked' if db_map.is_ranked else 'normal'

            # Group sets
            if draft_type == 'ranked':
                series_items = group_ranked_sets(items, target_battle_item, db_map, normalized_player_tag)
            else:
                series_items = [target_battle_item]

            sets_serialized = [serialize_set_data(it, normalized_player_tag) for it in series_items]

            return response.Response({
                "draft_type": draft_type,
                "sets": sets_serialized
            })

        except requests.RequestException as req_err:
            return response.Response(
                {"error": f"Brawl Stars API connection error or timeout. Please check your internet connection and ensure your API key matches your current IP address. Details: {str(req_err)}"},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            return response.Response(
                {"error": f"An error occurred while linking draft: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
