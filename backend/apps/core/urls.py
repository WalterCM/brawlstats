from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.core.views import BrawlerViewSet, MapViewSet, PlayerMeView

router = DefaultRouter()
router.register(r'brawlers', BrawlerViewSet, basename='brawler')
router.register(r'maps', MapViewSet, basename='map')

urlpatterns = [
    path('players/me/', PlayerMeView.as_view(), name='player-me'),
    path('', include(router.urls)),
]
