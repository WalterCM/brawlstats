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
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user = authenticate(username=username, password=password)
        if not user:
            return response.Response(
                {'error': 'Invalid username or password.'},
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
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return response.Response(
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if User.objects.filter(username=username).exists():
            return response.Response(
                {'error': 'Username is already taken.'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        user = User.objects.create_user(username=username, password=password)
        
        # Create Player model instance mapped to the user
        Player.objects.create(
            supabase_auth_id=f"django-user-{user.id}",
            name=user.username
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
            queryset = queryset.filter(mode__iexact=mode)
            
        return queryset
