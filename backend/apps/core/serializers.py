from rest_framework import serializers
from apps.core.models import Player, Brawler, Map

class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ['id', 'name', 'supabase_auth_id', 'player_tag', 'avatar_id']

class BrawlerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brawler
        fields = ['id', 'name', 'image_url', 'class_name']

class MapSerializer(serializers.ModelSerializer):
    class Meta:
        model = Map
        fields = ['id', 'name', 'mode', 'image_url', 'is_ranked']
