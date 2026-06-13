from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.matches.models import Match
from apps.matches.serializers import MatchSerializer
from apps.core.permissions import IsSupabaseAuthenticated

class MatchViewSet(viewsets.ModelViewSet):
    serializer_class = MatchSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def get_queryset(self):
        # Filter match history specifically to the authenticated player
        return Match.objects.filter(player=self.request.player).order_by('-date')

    @action(detail=True, methods=['post'], url_path='link-api')
    def link_api(self, request, pk=None):
        match = self.get_object()
        
        # Fetch recent battle logs from Brawl Stars API for the player
        import os
        import requests
        api_key = os.getenv('BRAWL_STARS_API_KEY')
        player_tag = request.player.player_tag or os.getenv('BRAWL_STARS_PLAYER_TAG')

        if not api_key:
            return Response(
                {"error": "BRAWL_STARS_API_KEY is not configured in the backend environment."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not player_tag:
            return Response(
                {"error": "Please configure your Player Tag in your Profile page before linking matches."},
                status=status.HTTP_400_BAD_REQUEST
            )

        encoded_tag = player_tag.replace('#', '%23')
        url = f"https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
        headers = {
            "Authorization": f"Bearer {api_key}"
        }

        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return Response(
                    {"error": f"Failed to fetch battle log from Brawl Stars API: {res.text}"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            data = res.json()
            items = data.get('items', [])
            if not items:
                return Response(
                    {"error": "No battles found in player's battle log."},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Match criteria
            map_name = match.map.name
            my_brawler_name = match.my_brawler.name if match.my_brawler else None
            match_result = match.result  # victory / defeat
            
            # Normalize for matching
            normalized_player_tag = player_tag.replace('#', '').upper()

            # Iterate over battle log entries to find a matching battle
            matched_battle = None
            for item in items:
                event = item.get('event', {})
                battle = item.get('battle', {})
                
                # Check map
                item_map_name = event.get('map')
                if not item_map_name or item_map_name.strip().lower() != map_name.strip().lower():
                    continue
                
                # Find player and check brawler
                teams = battle.get('teams', [])
                allied_team = None
                my_brawler_api_name = None
                for team_idx, team_players in enumerate(teams):
                    for p in team_players:
                        p_tag = p.get('tag', '').replace('#', '').upper()
                        if p_tag == normalized_player_tag:
                            allied_team = team_players
                            my_brawler_api_name = p.get('brawler', {}).get('name')
                            break
                    if allied_team:
                        break
                
                if not allied_team or not my_brawler_api_name:
                    continue
                
                if my_brawler_name and my_brawler_api_name.strip().lower() != my_brawler_name.strip().lower():
                    continue
                
                # Check result
                raw_result = battle.get('result', 'defeat')
                api_result = 'victory' if raw_result == 'victory' else 'defeat'
                if api_result != match_result:
                    continue
                
                # Ensure this battleTime is not already linked to another match
                battle_time = item.get('battleTime')
                if Match.objects.filter(player=request.player, api_match_id=battle_time).exclude(id=match.id).exists():
                    continue
                
                matched_battle = item
                break
            
            if not matched_battle:
                return Response(
                    {"error": f"Could not find an unlinked battle log entry matching Map: '{map_name}', Brawler: '{my_brawler_name or 'Any'}', Result: '{match_result}'."},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Update match and save
            battle_time = matched_battle.get('battleTime')
            match.api_match_id = battle_time
            match.save()
            
            serializer = self.get_serializer(match)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"An error occurred while linking match: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
