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

        if not map_id:
            return response.Response({"error": "map_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Exclude brawlers that are picked or banned during draft
        excluded_ids = set(allies_picked + enemies_picked + allies_banned + enemies_banned)
        
        try:
            target_map = Map.objects.get(id=map_id)
        except Map.DoesNotExist:
            return response.Response({"error": "Map not found"}, status=status.HTTP_404_NOT_FOUND)

        brawlers = Brawler.objects.exclude(id__in=excluded_ids)
        total_map_matches = Match.objects.filter(player=player, map=target_map).count()
        suggestions = []

        for b in brawlers:
            # --- 1. Component A: Adjusted Win Rate (Bayesian Beta Smoothing) ---
            personal_matches = Match.objects.filter(player=player, map=target_map, my_brawler=b)
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

                # Local perception check
                try:
                    p = Perception.objects.get(player=player, my_brawler=b, brawler_rival=enemy)
                    val_map = {1: 1.15, 0: 1.00, -1: 0.85, -2: 0.65}
                    factor = val_map.get(p.value, 1.0)
                except Perception.DoesNotExist:
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
                ).distinct()
                
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
