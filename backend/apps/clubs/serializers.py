from rest_framework import serializers
from apps.core.models import Player
from apps.clubs.models import Club, ClubMember, ForumCategory, ForumThread, ForumReply

class ClubMemberSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.name', read_only=True)
    player_tag = serializers.CharField(source='player.player_tag', read_only=True)
    avatar_id = serializers.IntegerField(source='player.avatar_id', read_only=True)

    class Meta:
        model = ClubMember
        fields = ['id', 'club', 'player', 'player_name', 'player_tag', 'avatar_id', 'role', 'is_approved', 'joined_at']
        read_only_fields = ['id', 'joined_at']

class ClubSerializer(serializers.ModelSerializer):
    members = ClubMemberSerializer(many=True, read_only=True)
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ['id', 'name', 'tag', 'description', 'created_at', 'members', 'members_count']
        read_only_fields = ['id', 'created_at']

    def get_members_count(self, obj):
        return obj.members.filter(is_approved=True).count()

class ForumCategorySerializer(serializers.ModelSerializer):
    threads_count = serializers.SerializerMethodField()

    class Meta:
        model = ForumCategory
        fields = ['id', 'name', 'description', 'threads_count']

    def get_threads_count(self, obj):
        return obj.threads.count()

class ForumThreadSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    author_tag = serializers.CharField(source='author.player_tag', read_only=True)
    author_avatar_id = serializers.IntegerField(source='author.avatar_id', read_only=True)
    replies_count = serializers.SerializerMethodField()

    class Meta:
        model = ForumThread
        fields = [
            'id', 'category', 'title', 'content', 'author', 
            'author_name', 'author_tag', 'author_avatar_id', 
            'created_at', 'updated_at', 'replies_count'
        ]
        read_only_fields = ['id', 'author', 'created_at', 'updated_at']

    def get_replies_count(self, obj):
        return obj.replies.count()

class ForumReplySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    author_tag = serializers.CharField(source='author.player_tag', read_only=True)
    author_avatar_id = serializers.IntegerField(source='author.avatar_id', read_only=True)

    class Meta:
        model = ForumReply
        fields = ['id', 'thread', 'author', 'author_name', 'author_tag', 'author_avatar_id', 'content', 'created_at']
        read_only_fields = ['id', 'author', 'created_at']
