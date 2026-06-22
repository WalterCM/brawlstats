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
    perceptions = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = ['id', 'map_id', 'my_brawler_id', 'mode', 'result', 'draft_type', 'date', 'draft_events', 'api_match_id', 'my_brawler_trophies', 'is_star_player', 'perceptions']
        read_only_fields = ['id', 'date']

    def get_perceptions(self, obj):
        return {p.brawler_rival_id: p.value for p in obj.perceptions.all()}

    def create(self, validated_data):
        draft_events_data = validated_data.pop('draft_events', [])
        player = self.context['request'].player
        
        match = Match.objects.create(player=player, **validated_data)
        
        # Ingest draft events sequentially
        for event_data in draft_events_data:
            DraftEvent.objects.create(match=match, **event_data)
            
        return match

    def update(self, instance, validated_data):
        draft_events_data = validated_data.pop('draft_events', None)
        
        # Update match primitive fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update draft events: delete old events and create new ones
        if draft_events_data is not None:
            instance.draft_events.all().delete()
            for event_data in draft_events_data:
                DraftEvent.objects.create(match=instance, **event_data)
                
        return instance
