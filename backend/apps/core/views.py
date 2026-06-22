from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework import viewsets, views, response, status
from apps.core.models import Brawler, Map, Player
from apps.core.serializers import BrawlerSerializer, MapSerializer, PlayerSerializer
from apps.core.permissions import IsSupabaseAuthenticated

class UserLoginView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return response.Response(
                {'error': 'Username/Email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Support hybrid login by username or email
        from django.db.models import Q
        user_obj = User.objects.filter(Q(username__iexact=username) | Q(email__iexact=username)).first()
        if not user_obj:
            return response.Response(
                {'error': 'Invalid username/email or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
            
        user = authenticate(username=user_obj.username, password=password)
        if not user:
            return response.Response(
                {'error': 'Invalid username/email or password.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
            
        token, created = Token.objects.get_or_create(user=user)
        return response.Response({
            'token': token.key,
            'username': user.username
        }, status=status.HTTP_200_OK)

class UserRegisterView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get('email') or request.data.get('username')
        password = request.data.get('password')
        if not email or not password:
            return response.Response(
                {'error': 'Email and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            return response.Response(
                {'error': 'Email is already registered.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        user = User.objects.create_user(username=email, email=email, password=password)
        
        temp_name = email.split('@')[0] if '@' in email else email
        Player.objects.create(
            supabase_auth_id=f"django-user-{user.id}",
            name=temp_name
        )
        
        token = Token.objects.create(user=user)
        return response.Response({
            'token': token.key,
            'username': user.username
        }, status=status.HTTP_201_CREATED)

class PlayerMeView(views.APIView):
    permission_classes = [IsSupabaseAuthenticated]

    def get(self, request):
        serializer = PlayerSerializer(request.player)
        return response.Response(serializer.data)

    def patch(self, request):
        serializer = PlayerSerializer(request.player, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return response.Response(serializer.data)
        return response.Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class PasswordlessAccessView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        player_tag = request.data.get('player_tag')
        if not player_tag:
            return response.Response(
                {'error': 'Player Tag is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalize tag
        player_tag = player_tag.strip().upper()
        if not player_tag.startswith('#'):
            player_tag = '#' + player_tag

        # Find existing player (case-insensitive lookup)
        player = Player.objects.filter(player_tag__iexact=player_tag).first()

        if not player:
            # Fetch latest name from Brawl Stars API only for new players
            import os
            import requests
            api_key = os.getenv('BRAWL_STARS_API_KEY')
            if not api_key:
                return response.Response(
                    {'error': 'BRAWL_STARS_API_KEY is not configured in backend environment.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            encoded_tag = player_tag.replace('#', '%23')
            url = f"https://api.brawlstars.com/v1/players/{encoded_tag}"
            headers = {
                "Authorization": f"Bearer {api_key}"
            }
            try:
                res = requests.get(url, headers=headers, timeout=5)
                if res.status_code == 200:
                    player_data = res.json()
                    api_name = player_data.get('name', f"Player {player_tag}")
                    api_avatar_id = player_data.get('icon', {}).get('id')
                else:
                    return response.Response(
                        {'error': f'Brawl Stars API returned error {res.status_code}: {res.text}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return response.Response(
                    {'error': f'Failed to contact Brawl Stars API: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Create new player
            player = Player.objects.create(
                name=api_name,
                player_tag=player_tag,
                avatar_id=api_avatar_id,
                supabase_auth_id=f"django-user-temp-{player_tag[1:].lower()}"
            )
            username = f"user_{player.id}"
            user, _ = User.objects.get_or_create(username=username)
            player.supabase_auth_id = f"django-user-{user.id}"
            player.save()
        else:
            # Existing player: just normalize tag and resolve user without making API request
            player.player_tag = player_tag
            player.save()

            # Attempt a quick, graceful update of name and avatar_id from Brawl Stars API in a background thread
            import threading
            def update_player_async(p_id, p_tag):
                import os
                import requests
                api_key = os.getenv('BRAWL_STARS_API_KEY')
                if api_key:
                    encoded_tag = p_tag.replace('#', '%23')
                    url = f"https://api.brawlstars.com/v1/players/{encoded_tag}"
                    headers = {"Authorization": f"Bearer {api_key}"}
                    try:
                        res = requests.get(url, headers=headers, timeout=5)
                        if res.status_code == 200:
                            # Refetch inside thread to avoid django threading model db state issues
                            from apps.core.models import Player
                            p = Player.objects.get(id=p_id)
                            player_data = res.json()
                            p.name = player_data.get('name', p.name)
                            api_avatar_id = player_data.get('icon', {}).get('id')
                            if api_avatar_id:
                                p.avatar_id = api_avatar_id
                            p.save()
                    except Exception:
                        pass

            threading.Thread(target=update_player_async, args=(player.id, player_tag), daemon=True).start()
            
            user = None
            if player.supabase_auth_id and player.supabase_auth_id.startswith('django-user-'):
                try:
                    user_id_str = player.supabase_auth_id.split('-')[-1]
                    user = User.objects.get(id=int(user_id_str))
                except (ValueError, User.DoesNotExist):
                    pass
            
            if not user:
                username = f"user_{player.id}"
                user, _ = User.objects.get_or_create(username=username)
                player.supabase_auth_id = f"django-user-{user.id}"
                player.save()

        token, created = Token.objects.get_or_create(user=user)
        return response.Response({
            'token': token.key,
            'username': player.name,
            'player_tag': player.player_tag,
            'player_id': player.id
        }, status=status.HTTP_200_OK)

class PlayerListView(views.APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        players = Player.objects.filter(player_tag__isnull=False).exclude(player_tag='').order_by('name')
        serializer = PlayerSerializer(players, many=True)
        return response.Response(serializer.data)

class BrawlerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Brawler.objects.all().order_name = ['name']
    serializer_class = BrawlerSerializer
    queryset = Brawler.objects.all().order_by('name')

class MapViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MapSerializer

    def get_queryset(self):
        queryset = Map.objects.all().order_by('name')
        is_ranked = self.request.query_params.get('is_ranked')
        if is_ranked is not None:
            queryset = queryset.filter(is_ranked=is_ranked.lower() in ['true', '1'])
        
        mode = self.request.query_params.get('mode')
        if mode is not None:
            mode_mappings = {
                'gemgrab': ['gemGrab', 'Gem Grab'],
                'brawlball': ['brawlBall', 'Brawl Ball'],
                'heist': ['heist', 'Heist'],
                'hotzone': ['hotZone', 'Hot Zone'],
                'knockout': ['knockout', 'Knockout'],
                'bounty': ['bounty', 'Bounty'],
            }
            mode_lower = mode.lower()
            if mode_lower in mode_mappings:
                queryset = queryset.filter(mode__in=mode_mappings[mode_lower])
            else:
                queryset = queryset.filter(mode__iexact=mode)
            
        return queryset
