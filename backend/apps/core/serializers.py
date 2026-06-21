from rest_framework import serializers
from apps.core.models import Player, Brawler, Map

class PlayerSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = Player
        fields = ['id', 'name', 'supabase_auth_id', 'player_tag', 'avatar_id', 'min_normal_trophies', 'is_admin']

    def get_is_admin(self, obj):
        from django.contrib.auth.models import User
        if obj.supabase_auth_id.startswith('django-user-'):
            try:
                user_id = int(obj.supabase_auth_id.split('-')[-1])
                return User.objects.filter(id=user_id, is_staff=True).exists() or User.objects.filter(id=user_id, is_superuser=True).exists()
            except (ValueError, TypeError):
                pass
        return False

class BrawlerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brawler
        fields = ['id', 'name', 'image_url', 'class_name']

class MapSerializer(serializers.ModelSerializer):
    class Meta:
        model = Map
        fields = ['id', 'name', 'mode', 'image_url', 'is_ranked']
