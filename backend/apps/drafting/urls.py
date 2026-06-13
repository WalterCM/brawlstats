from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.drafting.views import PerceptionViewSet, DraftSuggestionView, LastBattleIngestView

router = DefaultRouter()
router.register(r'perceptions', PerceptionViewSet, basename='perception')

urlpatterns = [
    path('draft/suggest/', DraftSuggestionView.as_view(), name='draft-suggest'),
    path('draft/last-battle/', LastBattleIngestView.as_view(), name='last-battle-ingest'),
    path('', include(router.urls)),
]
