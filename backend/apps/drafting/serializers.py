from rest_framework import serializers
from apps.core.models import Brawler
from apps.drafting.models import Perception

class PerceptionSerializer(serializers.ModelSerializer):
    my_brawler_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='my_brawler'
    )
    brawler_rival_id = serializers.PrimaryKeyRelatedField(
        queryset=Brawler.objects.all(), source='brawler_rival'
    )

    class Meta:
        model = Perception
        fields = ['id', 'my_brawler_id', 'brawler_rival_id', 'value', 'date']
        read_only_fields = ['id', 'date']

    def create(self, validated_data):
        player = self.context['request'].player
        my_brawler = validated_data['my_brawler']
        brawler_rival = validated_data['brawler_rival']
        value = validated_data['value']

        # Upsert the perception record
        perception, created = Perception.objects.update_or_create(
            player=player,
            my_brawler=my_brawler,
            brawler_rival=brawler_rival,
            defaults={'value': value}
        )
        return perception
