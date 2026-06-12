from rest_framework import viewsets, views, response, status
from apps.core.models import Brawler, Map, Player
from apps.core.serializers import BrawlerSerializer, MapSerializer, PlayerSerializer
from apps.core.permissions import IsSupabaseAuthenticated

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
