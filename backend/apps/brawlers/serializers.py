from rest_framework import serializers
from apps.brawlers.models import MetaBrawlerStats, MetaMapStats


class MetaBrawlerStatsSerializer(serializers.ModelSerializer):
    brawler_name = serializers.CharField(source='brawler.name', read_only=True)
    brawler_class = serializers.CharField(source='brawler.class_name', read_only=True)
    brawler_image = serializers.URLField(source='brawler.image_url', read_only=True)

    class Meta:
        model = MetaBrawlerStats
        fields = [
            'id', 'brawler_id', 'brawler_name', 'brawler_class', 'brawler_image',
            'win_rate', 'pick_rate', 'tier', 'date', 'last_synced'
        ]


class MetaMapStatsSerializer(serializers.ModelSerializer):
    brawler_name = serializers.CharField(source='brawler.name', read_only=True)
    brawler_image = serializers.URLField(source='brawler.image_url', read_only=True)
    brawler_class = serializers.CharField(source='brawler.class_name', read_only=True)
    map_name = serializers.CharField(source='map.name', read_only=True)
    map_mode = serializers.CharField(source='map.mode', read_only=True)
    map_image = serializers.URLField(source='map.image_url', read_only=True)

    class Meta:
        model = MetaMapStats
        fields = [
            'id', 'brawler_id', 'brawler_name', 'brawler_image', 'brawler_class',
            'map_id', 'map_name', 'map_mode', 'map_image',
            'win_rate', 'pick_rate', 'category', 'trophy_range', 'tier', 'date', 'last_synced'
        ]
