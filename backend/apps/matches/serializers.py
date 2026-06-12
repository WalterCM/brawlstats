from rest_framework import serializers
from apps.core.models import Map, Brawler
from apps.matches.models import Match, DraftEvent

class DraftEventSerializer(serializers.ModelSerializer):
    brawler_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='brawler'
    )

    class Meta:
        model = DraftEvent
        fields = ['type', 'brawler_id', 'team', 'order']

class MatchSerializer(serializers.ModelSerializer):
    map_id = serializers.PrimaryKeyRelatedField(
        queryset=Map.objects.all(), source='map'
    )
    my_brawler_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='my_brawler', required=False, allow_null=True
    )
    draft_events = DraftEventSerializer(many=True, required=False)

    class Meta:
        model = Match
        fields = ['id', 'map_id', 'my_brawler_id', 'mode', 'result', 'date', 'draft_events']
        read_only_fields = ['id', 'date']

    def create(self, validated_data):
        draft_events_data = validated_data.pop('draft_events', [])
        player = self.context['request'].player
        
        match = Match.objects.create(player=player, **validated_data)
        
        # Ingest draft events sequentially
        for event_data in draft_events_data:
            DraftEvent.objects.create(match=match, **event_data)
            
        return match
