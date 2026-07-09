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

class PlayerDetailView(views.APIView):
    permission_classes = [IsSupabaseAuthenticated]

    def get(self, request, pk):
        player = None
        if isinstance(pk, int) or (isinstance(pk, str) and pk.isdigit()):
            player = Player.objects.filter(pk=int(pk)).first()
        
        if not player:
            tag = pk
            if not tag.startswith('#'):
                tag = '#' + tag
            player = Player.objects.filter(player_tag__iexact=tag).first()

        if not player:
            return response.Response({'error': 'Player not found.'}, status=status.HTTP_404_NOT_FOUND)

        if player.id == request.player.id:
            return response.Response(PlayerSerializer(player).data)

        user = getattr(request, 'user', None)
        is_site_admin = user and (user.is_staff or user.is_superuser)
        if not is_site_admin:
            try:
                from apps.clubs.models import ClubMember
                my_membership = request.player.club_membership
                target_membership = player.club_membership
                if not (my_membership.club_id == target_membership.club_id and 
                        my_membership.is_approved and my_membership.is_active and
                        target_membership.is_approved and target_membership.is_active):
                    return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
            except (AttributeError, ClubMember.DoesNotExist):
                return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        return response.Response(PlayerSerializer(player).data)

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
