import math
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
        # Filter subjective ratings to the authenticated player
        return Perception.objects.filter(player=self.request.player).order_by('-date')


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
                            pick_rate_meta = 0.0
                        except MetaBrawlerStats.DoesNotExist:
                            win_rate_meta = 0.5 * 0.6
                            pick_rate_meta = 0.0

            k_prior = 20.0
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

                if games_count > 0:
                    from django.db.models import Sum
                    sum_value = perceptions.aggregate(Sum('value'))['value__sum'] or 0
                    avg_value = sum_value / games_count
                    
                    # Linear interpolation for rating (from -2.0 to 1.0)
                    # -2.0 -> 0.65 (hard counter)
                    # -1.0 -> 0.85 (hard)
                    #  0.0 -> 1.00 (neutral)
                    #  1.0 -> 1.15 (easy)
                    if avg_value <= -1.0:
                        factor = 0.85 + (avg_value - (-1.0)) * 0.20
                    else:
                        factor = 1.00 + avg_value * 0.15
                else:
                    # Meta matchup fallback
                    try:
                        m_match = MetaMatchup.objects.get(brawler_a=b, brawler_b=enemy)
                        factor = m_match.win_rate_a / 0.5
                    except MetaMatchup.DoesNotExist:
                        factor = 1.0
                
                score_b *= factor

            # --- 3. Component C: Synergy Factor ---
            score_c = 1.0
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

                if games_synergy > 0:
                    alpha_syn = 2.5
                    beta_syn = 2.5
                    syn_rate = (wins_synergy + alpha_syn) / (games_synergy + alpha_syn + beta_syn)
                    factor = syn_rate / 0.5
                else:
                    factor = 1.0

                score_c *= factor

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
            target_battle = None
            db_map = None
            allowed_modes = {'gemgrab', 'brawlball', 'heist', 'hotzone', 'knockout', 'bounty'}

            for item in items:
                battle = item.get('battle', {})
                if 'teams' in battle and len(battle['teams']) == 2 and len(battle['teams'][0]) == 3 and len(battle['teams'][1]) == 3:
                    event = item.get('event', {})
                    map_name = event.get('map')
                    if map_name:
                        candidate_map = Map.objects.filter(name__iexact=map_name).first()
                        if not candidate_map:
                            candidate_map = Map.objects.filter(name__icontains=map_name).first()
                        if candidate_map:
                            normalized_mode = candidate_map.mode.lower().replace(' ', '').replace('_', '').replace('-', '')
                            if normalized_mode in allowed_modes:
                                # Resolve player brawler to get trophies and check normal filters
                                allied_team = None
                                my_brawler_api = None
                                for t_idx, team_players in enumerate(battle.get('teams', [])):
                                    for p in team_players:
                                        p_tag = p.get('tag', '').replace('#', '').upper()
                                        if p_tag == normalized_player_tag:
                                            allied_team = team_players
                                            my_brawler_api = p.get('brawler')
                                            break
                                    if allied_team:
                                        break
                                
                                if not allied_team or not my_brawler_api:
                                    continue
                                
                                # Resolve draft type
                                battle_type = battle.get('type', '')
                                if battle_type:
                                    candidate_draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
                                else:
                                    candidate_draft_type = 'ranked' if candidate_map.is_ranked else 'normal'
                                
                                # Check normal filters
                                if candidate_draft_type == 'normal':
                                    my_brawler_id = str(my_brawler_api.get('id'))
                                    my_brawler = Brawler.objects.filter(id=my_brawler_id).first()
                                    if not my_brawler:
                                        my_brawler = Brawler.objects.filter(name__iexact=my_brawler_api.get('name')).first()
                                    if not my_brawler:
                                        continue
                                    
                                    my_brawler_trophies = my_brawler_api.get('trophies', 0) or 0
                                    min_trophies = getattr(request.player, 'min_normal_trophies', 750)
                                    has_ranked_match = Match.objects.filter(player=request.player, my_brawler=my_brawler, draft_type='ranked').exists()
                                    if my_brawler_trophies < min_trophies and not has_ranked_match:
                                        continue
                                
                                target_battle = item
                                db_map = candidate_map
                                break

            if not target_battle or not db_map:
                return response.Response(
                    {"error": "No competitive 3v3 team battles found in the player's recent battle log."},
                    status=status.HTTP_404_NOT_FOUND
                )

            battle_time = target_battle.get('battleTime')
            if battle_time and Match.objects.filter(player=request.player, api_match_id=battle_time).exists():
                return response.Response(
                    {"error": "The latest competitive match in your battle log is already recorded in Brawl Stats."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            event = target_battle.get('event', {})
            battle = target_battle.get('battle', {})

            teams = battle.get('teams', [])
            allied_team = None
            enemy_team = None
            my_brawler_data = None

            normalized_player_tag = player_tag.replace('#', '').upper()

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

            if not allied_team:
                return response.Response(
                    {"error": f"Could not find player tag '{player_tag}' in the last battle's teams."},
                    status=status.HTTP_400_BAD_REQUEST
                )

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

            my_brawler_serialized = get_brawler_or_serialize(my_brawler_data)
            allies_serialized = [get_brawler_or_serialize(p.get('brawler')) for p in allied_team]
            enemies_serialized = [get_brawler_or_serialize(p.get('brawler')) for p in enemy_team]

            raw_result = battle.get('result', 'defeat')
            result = 'victory' if raw_result == 'victory' else 'defeat'

            # Parse trophies and star player status
            my_brawler_trophies = my_brawler_data.get('trophies', 0) or 0
            star_player_api = battle.get('starPlayer')
            star_player_tag = star_player_api.get('tag', '') if star_player_api else ''
            is_star_player = star_player_tag.replace('#', '').upper() == normalized_player_tag

            battle_type = battle.get('type', '')
            if battle_type:
                draft_type = 'ranked' if battle_type in ('soloRanked', 'teamRanked') else 'normal'
            else:
                draft_type = 'ranked' if db_map.is_ranked else 'normal'

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
                "result": result,
                "api_match_id": battle_time,
                "my_brawler_trophies": my_brawler_trophies,
                "is_star_player": is_star_player,
                "draft_type": draft_type
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
