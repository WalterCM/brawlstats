from rest_framework import viewsets
from apps.matches.models import Match
from apps.matches.serializers import MatchSerializer
from apps.core.permissions import IsSupabaseAuthenticated

class MatchViewSet(viewsets.ModelViewSet):
    serializer_class = MatchSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def get_queryset(self):
        # Filter match history specifically to the authenticated player
        return Match.objects.filter(player=self.request.player).order_by('-date')
