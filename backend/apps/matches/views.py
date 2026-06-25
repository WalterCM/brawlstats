import re
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
        request_player = self.request.player
        target_player_id = self.request.query_params.get('player_id')
        
        if target_player_id and str(target_player_id) != str(request_player.id):
            user = self.request.user
            is_site_admin = user and (user.is_staff or user.is_superuser)
            if is_site_admin:
                return Match.objects.filter(player_id=target_player_id).order_by('-date')
            try:
                from apps.clubs.models import ClubMember
                my_membership = request_player.club_membership
                target_membership = ClubMember.objects.get(player_id=target_player_id)
                if (my_membership.club_id == target_membership.club_id and 
                    my_membership.is_approved and my_membership.is_active and
                    target_membership.is_approved and target_membership.is_active):
                    return Match.objects.filter(player_id=target_player_id).order_by('-date')
            except (AttributeError, ClubMember.DoesNotExist):
                pass
            return Match.objects.none()

        return Match.objects.filter(player=request_player).order_by('-date')

    @action(detail=False, methods=['post'], url_path='submit-series')
    def submit_series(self, request):
        from apps.core.models import Map, Brawler
        from apps.matches.models import Match, DraftEvent
        from apps.drafting.models import Perception

        data = request.data
        map_id = data.get('map_id')
        my_brawler_id = data.get('my_brawler_id')
        mode = data.get('mode')
        draft_type = data.get('draft_type', 'normal')
        draft_events_data = data.get('draft_events', [])
        perceptions_data = data.get('perceptions', [])
        sets_data = data.get('sets', [])

        if not map_id:
            return Response({"error": "map_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            db_map = Map.objects.get(id=map_id)
        except Map.DoesNotExist:
            return Response({"error": "Map not found."}, status=status.HTTP_404_NOT_FOUND)

        my_brawler = None
        if my_brawler_id:
            try:
                my_brawler = Brawler.objects.get(id=my_brawler_id)
            except Brawler.DoesNotExist:
                pass

        # If sets_data is empty, represent it as a single manual match
        if not sets_data:
            sets_data = [{
                "api_match_id": None,
                "result": data.get('result', 'victory'),
                "my_brawler_trophies": data.get('my_brawler_trophies'),
                "is_star_player": data.get('is_star_player', False)
            }]

        import uuid
        first_api_id = sets_data[0].get('api_match_id')
        series_id = first_api_id if first_api_id else f"manual-{uuid.uuid4().hex[:12]}"

        created_matches = []

        from django.db import transaction
        try:
            with transaction.atomic():
                for idx, set_item in enumerate(sets_data):
                    api_match_id = set_item.get('api_match_id')
                    result = set_item.get('result', 'victory')
                    my_brawler_trophies = set_item.get('my_brawler_trophies')
                    is_star_player = set_item.get('is_star_player', False)

                    if api_match_id:
                        match, created = Match.objects.get_or_create(
                            player=request.player,
                            api_match_id=api_match_id,
                            defaults=dict(
                                map=db_map,
                                my_brawler=my_brawler,
                                mode=mode or db_map.mode,
                                result=result,
                                draft_type=draft_type,
                                series_api_match_id=series_id,
                                my_brawler_trophies=my_brawler_trophies,
                                is_star_player=is_star_player,
                            )
                        )
                    else:
                        match = Match.objects.create(
                            player=request.player,
                            map=db_map,
                            my_brawler=my_brawler,
                            mode=mode or db_map.mode,
                            result=result,
                            draft_type=draft_type,
                            api_match_id=api_match_id,
                            series_api_match_id=series_id,
                            my_brawler_trophies=my_brawler_trophies,
                            is_star_player=is_star_player
                        )
                    created_matches.append(match)

                    for event in draft_events_data:
                        b_id = event.get('brawler_id')
                        if b_id:
                            try:
                                b_obj = Brawler.objects.get(id=b_id)
                                DraftEvent.objects.create(
                                    match=match,
                                    type=event.get('type', 'pick'),
                                    brawler=b_obj,
                                    team=event.get('team', 'allied'),
                                    order=event.get('order', 0)
                                )
                            except Brawler.DoesNotExist:
                                pass

                    if idx == 0:
                        for perc in perceptions_data:
                            rival_id = perc.get('brawler_rival_id')
                            val = perc.get('value')
                            if rival_id and val is not None:
                                try:
                                    rival_obj = Brawler.objects.get(id=rival_id)
                                    Perception.objects.create(
                                        match=match,
                                        player=request.player,
                                        my_brawler=my_brawler,
                                        brawler_rival=rival_obj,
                                        value=val
                                    )
                                except Brawler.DoesNotExist:
                                    pass

            serializer = MatchSerializer(created_matches[0], context={'request': request})
            return Response({
                "message": f"Successfully logged {len(created_matches)} match sets.",
                "match": serializer.data
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {"error": f"An error occurred while saving the match series: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
            
            # Group sets if it is a ranked match
            from apps.drafting.views import group_ranked_sets, resolve_battle_teams
            from apps.matches.models import DraftEvent
            if match.draft_type == 'ranked':
                series_items = group_ranked_sets(items, matched_battle, match.map, normalized_player_tag)
            else:
                series_items = [matched_battle]

            # The first set of the series (chronologically first) will update the existing manual match
            first_set_item = series_items[0]
            first_battle_time = first_set_item.get('battleTime')
            
            # Update the existing match
            first_battle = first_set_item.get('battle', {})
            allied_team, enemy_team, my_brawler_data = resolve_battle_teams(first_battle, normalized_player_tag)
            raw_result = first_battle.get('result', 'defeat')
            
            match.api_match_id = first_battle_time
            match.series_api_match_id = first_battle_time
            match.result = 'victory' if raw_result == 'victory' else 'defeat'
            if my_brawler_data:
                match.my_brawler_trophies = my_brawler_data.get('trophies')
                star_player_api = first_battle.get('starPlayer')
                star_player_tag = star_player_api.get('tag', '') if star_player_api else ''
                match.is_star_player = star_player_tag.replace('#', '').upper() == normalized_player_tag
            match.save()

            # Create subsequent matches for any additional sets in the series
            for extra_item in series_items[1:]:
                extra_battle_time = extra_item.get('battleTime')
                # Skip if already exists
                if Match.objects.filter(player=request.player, api_match_id=extra_battle_time).exists():
                    continue
                
                extra_battle = extra_item.get('battle', {})
                _, _, extra_my_brawler_data = resolve_battle_teams(extra_battle, normalized_player_tag)
                extra_raw_result = extra_battle.get('result', 'defeat')
                
                extra_trophies = extra_my_brawler_data.get('trophies') if extra_my_brawler_data else None
                extra_star_player_api = extra_battle.get('starPlayer')
                extra_star_player_tag = extra_star_player_api.get('tag', '') if extra_star_player_api else ''
                extra_is_star_player = extra_star_player_tag.replace('#', '').upper() == normalized_player_tag
                
                extra_match = Match.objects.create(
                    player=request.player,
                    map=match.map,
                    my_brawler=match.my_brawler,
                    mode=match.mode,
                    draft_type=match.draft_type,
                    result='victory' if extra_raw_result == 'victory' else 'defeat',
                    api_match_id=extra_battle_time,
                    series_api_match_id=first_battle_time,
                    my_brawler_trophies=extra_trophies,
                    is_star_player=extra_is_star_player
                )

                for original_evt in match.draft_events.all():
                    DraftEvent.objects.create(
                        match=extra_match,
                        brawler=original_evt.brawler,
                        type=original_evt.type,
                        team=original_evt.team,
                        order=original_evt.order
                    )
            
            serializer = self.get_serializer(match)
            return Response(serializer.data, status=status.HTTP_200_OK)

        except Exception as e:
            return Response(
                {"error": f"An error occurred while linking match: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _fetch_and_parse_battles(self, request, only_new=True):
        """Fetch battle log from BS API, parse 3v3 battles, return list of parsed dicts.
        only_new: if True, skip already-imported battles.
        Returns (battles, error_response)."""
        import os
        import requests
        from apps.core.models import Map, Brawler

        api_key = os.getenv('BRAWL_STARS_API_KEY')
        player_tag = request.player.player_tag or os.getenv('BRAWL_STARS_PLAYER_TAG')

        if not api_key:
            return None, Response(
                {"error": "BRAWL_STARS_API_KEY is not configured in the backend environment."},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not player_tag:
            return None, Response(
                {"error": "Please configure your Player Tag in your Profile page before syncing."},
                status=status.HTTP_400_BAD_REQUEST
            )

        encoded_tag = player_tag.replace('#', '%23')
        url = f"https://api.brawlstars.com/v1/players/{encoded_tag}/battlelog"
        headers = {"Authorization": f"Bearer {api_key}"}

        try:
            res = requests.get(url, headers=headers, timeout=10)
            if res.status_code != 200:
                return None, Response(
                    {"error": f"Failed to fetch battle log from Brawl Stars API: {res.text}"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            data = res.json()
            items = data.get('items', [])
            if not items:
                return [], None

            normalized_player_tag = player_tag.replace('#', '').upper()
            allowed_modes = {'gemgrab', 'brawlball', 'heist', 'hotzone', 'knockout', 'bounty'}
            battles = []

            for item in reversed(items):
                battle = item.get('battle', {})
                teams = battle.get('teams', [])

                if not teams or len(teams) != 2 or len(teams[0]) != 3 or len(teams[1]) != 3:
                    continue

                battle_time = item.get('battleTime')
                if not battle_time:
                    continue

                if only_new and Match.objects.filter(player=request.player, api_match_id=battle_time).exists():
                    continue

                event = item.get('event', {})
                map_name = event.get('map')
                if not map_name:
                    continue

                allied_team = enemy_team = my_brawler_api = None
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
                if not allied_team:
                    continue

                clean_name = re.sub(r'[\'`\u2018\u2019\u201a\u201b\u2032]', '', map_name)
                db_map = Map.objects.filter(name__iexact=clean_name).first()
                if not db_map:
                    db_map = Map.objects.filter(name__iexact=map_name).first()
                if not db_map:
                    db_map = Map.objects.filter(name__icontains=clean_name).first()
                if not db_map:
                    continue

                normalized_mode = db_map.mode.lower().replace(' ', '').replace('_', '').replace('-', '')
                if normalized_mode not in allowed_modes:
                    continue

                my_brawler_id = str(my_brawler_api.get('id', ''))
                my_brawler = Brawler.objects.filter(id=my_brawler_id).first()
                if not my_brawler:
                    my_brawler = Brawler.objects.filter(name__iexact=my_brawler_api.get('name', '')).first()
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

                battles.append({
                    'battle_time': battle_time,
                    'map': db_map,
                    'my_brawler': my_brawler,
                    'mode': db_map.mode,
                    'result': result,
                    'draft_type': draft_type,
                    'trophies': my_brawler_trophies,
                    'is_star_player': is_star_player,
                    'allied_team': allied_team,
                    'enemy_team': enemy_team,
                })

            return battles, None

        except requests.RequestException as req_err:
            return None, Response(
                {"error": f"Brawl Stars API connection error or timeout. Details: {str(req_err)}"},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            return None, Response(
                {"error": f"An error occurred while syncing matches: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'], url_path='sync-preview')
    def sync_preview(self, request):
        battles, err = self._fetch_and_parse_battles(request, only_new=True)
        if err:
            return err

        preview = []
        for b in battles:
            preview.append({
                'battle_time': b['battle_time'],
                'map_name': b['map'].name,
                'mode': b['mode'],
                'brawler_name': b['my_brawler'].name,
                'brawler_id': b['my_brawler'].id,
                'result': b['result'],
                'draft_type': b['draft_type'],
                'trophies': b['trophies'],
                'is_star_player': b['is_star_player'],
            })

        return Response({'available': preview, 'count': len(preview)})

    @action(detail=False, methods=['post'], url_path='sync-import')
    def sync_import(self, request):
        battle_times = request.data.get('battle_times', [])
        if not battle_times or not isinstance(battle_times, list):
            return Response(
                {"error": "battle_times must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.matches.models import DraftEvent
        from apps.core.models import Brawler

        selected_set = set(battle_times)
        battles, err = self._fetch_and_parse_battles(request, only_new=True)
        if err:
            return err

        to_import = [b for b in battles if b['battle_time'] in selected_set]
        if not to_import:
            return Response(
                {"error": "None of the requested battle_times are available for import (already imported or not found)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        synced_count = 0
        for b in to_import:
            match, created = Match.objects.get_or_create(
                player=request.player,
                api_match_id=b['battle_time'],
                defaults=dict(
                    map=b['map'],
                    my_brawler=b['my_brawler'],
                    mode=b['mode'],
                    result=b['result'],
                    draft_type=b['draft_type'],
                    my_brawler_trophies=b['trophies'],
                    is_star_player=b['is_star_player'],
                )
            )
            if not created:
                continue

            order = 0
            for p in b['allied_team']:
                b_api = p.get('brawler', {})
                b_id = str(b_api.get('id', ''))
                b_obj = Brawler.objects.filter(id=b_id).first()
                if not b_obj:
                    b_obj = Brawler.objects.filter(name__iexact=b_api.get('name', '')).first()
                if b_obj:
                    DraftEvent.objects.create(match=match, type='pick', brawler=b_obj, team='allied', order=order)
                    order += 1

            for p in b['enemy_team']:
                b_api = p.get('brawler', {})
                b_id = str(b_api.get('id', ''))
                b_obj = Brawler.objects.filter(id=b_id).first()
                if not b_obj:
                    b_obj = Brawler.objects.filter(name__iexact=b_api.get('name', '')).first()
                if b_obj:
                    DraftEvent.objects.create(match=match, type='pick', brawler=b_obj, team='enemy', order=order)
                    order += 1

            synced_count += 1

        return Response(
            {"message": f"Successfully imported {synced_count} match(es).", "synced_count": synced_count},
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'], url_path='sync-api')
    def sync_api(self, request):
        from apps.matches.utils import ingest_player_matches
        try:
            synced_count = ingest_player_matches(request.player)
            return Response(
                {"message": f"Successfully synchronized {synced_count} new matches from API.", "synced_count": synced_count},
                status=status.HTTP_200_OK
            )
        except ValueError as val_err:
            return Response(
                {"error": str(val_err)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"An error occurred while syncing matches: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

