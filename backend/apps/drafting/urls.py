from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.drafting.views import PerceptionViewSet, DraftSuggestionView

router = DefaultRouter()
router.register(r'perceptions', PerceptionViewSet, basename='perception')

urlpatterns = [
    path('draft/suggest/', DraftSuggestionView.as_view(), name='draft-suggest'),
    path('', include(router.urls)),
]
