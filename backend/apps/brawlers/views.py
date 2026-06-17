from django.db.models import Max
from rest_framework import viewsets
from apps.brawlers.models import MetaBrawlerStats, MetaMapStats
from apps.brawlers.serializers import MetaBrawlerStatsSerializer, MetaMapStatsSerializer
from apps.core.permissions import IsSupabaseAuthenticated


class MetaBrawlerStatsViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MetaBrawlerStatsSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def get_queryset(self):
        latest = MetaBrawlerStats.objects.aggregate(max_date=Max('date'))['max_date']
        qs = MetaBrawlerStats.objects.filter(date=latest).select_related('brawler')
        brawler_id = self.request.query_params.get('brawler_id')
        if brawler_id:
            qs = qs.filter(brawler_id=brawler_id)
        return qs.order_by('brawler__name')


class MetaMapStatsViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MetaMapStatsSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def get_queryset(self):
        latest = MetaMapStats.objects.aggregate(max_date=Max('date'))['max_date']
        qs = MetaMapStats.objects.filter(date=latest).select_related('brawler', 'map')
        map_id = self.request.query_params.get('map_id')
        if map_id:
            qs = qs.filter(map_id=map_id)
        return qs.order_by('map__name', 'brawler__name')
