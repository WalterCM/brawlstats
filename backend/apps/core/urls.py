from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.core.views import BrawlerViewSet, MapViewSet, PlayerMeView, UserLoginView, UserRegisterView, PlayerDetailView

router = DefaultRouter()
router.register(r'brawlers', BrawlerViewSet, basename='brawler')
router.register(r'maps', MapViewSet, basename='map')

urlpatterns = [
    path('auth/login/', UserLoginView.as_view(), name='auth-login'),
    path('auth/register/', UserRegisterView.as_view(), name='auth-register'),
    path('players/me/', PlayerMeView.as_view(), name='player-me'),
    path('players/<str:pk>/', PlayerDetailView.as_view(), name='player-detail'),
    path('', include(router.urls)),
]
