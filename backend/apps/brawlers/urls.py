from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.brawlers.views import MetaBrawlerStatsViewSet, MetaMapStatsViewSet

router = DefaultRouter()
router.register(r'brawler-meta', MetaBrawlerStatsViewSet, basename='brawler-meta')
router.register(r'map-meta', MetaMapStatsViewSet, basename='map-meta')

urlpatterns = [
    path('', include(router.urls)),
]
