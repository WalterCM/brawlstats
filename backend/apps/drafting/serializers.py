from rest_framework import serializers
from apps.core.models import Brawler
from apps.matches.models import Match
from apps.drafting.models import Perception

class PerceptionSerializer(serializers.ModelSerializer):
    match_id = serializers.PrimaryKeyRelatedField(
        queryset=Match.objects.all(), source='match'
    )
    my_brawler_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='my_brawler', required=False
    )
    brawler_rival_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='brawler_rival'
    )

    class Meta:
        model = Perception
        fields = ['id', 'match_id', 'my_brawler_id', 'brawler_rival_id', 'value', 'date']
        read_only_fields = ['id', 'date', 'my_brawler_id']

    def create(self, validated_data):
        player = self.context['request'].player
        match = validated_data['match']
        brawler_rival = validated_data['brawler_rival']
        value = validated_data['value']

        # Derive my_brawler from the match
        my_brawler = match.my_brawler

        # Upsert the perception record for this match and rival
        perception, created = Perception.objects.update_or_create(
            match=match,
            brawler_rival=brawler_rival,
            defaults={
                'player': player,
                'my_brawler': my_brawler,
                'value': value
            }
        )
        return perception
