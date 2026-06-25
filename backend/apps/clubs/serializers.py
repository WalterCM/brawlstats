from rest_framework import serializers
from apps.core.models import Player
from apps.clubs.models import Club, ClubMember, ForumCategory, ForumThread, ForumReply, LinkRequest, ClubConfig

class ClubMemberSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.name', read_only=True)
    player_tag = serializers.CharField(source='player.player_tag', read_only=True)
    avatar_id = serializers.IntegerField(source='player.avatar_id', read_only=True)
    is_linked = serializers.SerializerMethodField()
    linked_email = serializers.SerializerMethodField()
    senior_score = serializers.SerializerMethodField()
    is_senior_candidate = serializers.SerializerMethodField()
    days_in_club = serializers.SerializerMethodField()

    class Meta:
        model = ClubMember
        fields = [
            'id', 'club', 'player', 'player_name', 'player_tag', 
            'avatar_id', 'role', 'is_approved', 'is_active', 
            'joined_at', 'left_at', 'is_linked', 'linked_email',
            'senior_score', 'is_senior_candidate', 'days_in_club'
        ]
        read_only_fields = ['id', 'joined_at', 'left_at']

    def get_is_linked(self, obj):
        auth_id = obj.player.supabase_auth_id or ''
        return auth_id.startswith('django-user-')

    def get_senior_score(self, obj):
        return getattr(obj, '_senior_score', None)

    def get_is_senior_candidate(self, obj):
        return getattr(obj, '_is_senior_candidate', False)

    def get_days_in_club(self, obj):
        return getattr(obj, '_days_in_club', None)

    def get_linked_email(self, obj):
        auth_id = obj.player.supabase_auth_id or ''
        if auth_id.startswith('django-user-'):
            try:
                user_id = int(auth_id.replace('django-user-', ''))
                from django.contrib.auth.models import User
                target_user = User.objects.get(id=user_id)
                
                request = self.context.get('request')
                if request and request.user and request.user.is_authenticated:
                    # 1. The user themselves can see their own email
                    if request.user.id == target_user.id:
                        return target_user.email
                    
                    # 2. Staff/Superusers can see the email
                    if request.user.is_staff or request.user.is_superuser:
                        return target_user.email
                    
                    # 3. Club President and Vice President can see emails
                    try:
                        req_player = getattr(request, 'player', None)
                        if req_player:
                            req_membership = ClubMember.objects.filter(
                                club=obj.club, 
                                player=req_player, 
                                is_active=True
                            ).first()
                            if req_membership and req_membership.role in ['president', 'vice_president']:
                                return target_user.email
                    except Exception:
                        pass
                
                # Default fallback: mask email to ensure privacy
                return "Verificado"
            except (ValueError, User.DoesNotExist):
                return None
        return None

class ClubSerializer(serializers.ModelSerializer):
    members = ClubMemberSerializer(many=True, read_only=True)
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ['id', 'name', 'tag', 'description', 'created_at', 'members', 'members_count']
        read_only_fields = ['id', 'created_at']

    def get_members_count(self, obj):
        return obj.members.filter(is_approved=True, is_active=True).count()

class ForumCategorySerializer(serializers.ModelSerializer):
    threads_count = serializers.SerializerMethodField()

    class Meta:
        model = ForumCategory
        fields = ['id', 'name', 'description', 'threads_count', 'restricted_to_seniors']

    def get_threads_count(self, obj):
        return obj.threads.count()

class ForumThreadSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    author_tag = serializers.CharField(source='author.player_tag', read_only=True)
    author_avatar_id = serializers.IntegerField(source='author.avatar_id', read_only=True)
    replies_count = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    has_liked = serializers.SerializerMethodField()

    class Meta:
        model = ForumThread
        fields = [
            'id', 'category', 'title', 'content', 'author', 
            'author_name', 'author_tag', 'author_avatar_id', 
            'created_at', 'updated_at', 'replies_count',
            'is_pinned', 'likes_count', 'has_liked'
        ]
        read_only_fields = ['id', 'author', 'created_at', 'updated_at', 'is_pinned']

    def get_replies_count(self, obj):
        return obj.replies.count()

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_has_liked(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'player') and request.player:
            return obj.likes.filter(id=request.player.id).exists()
        return False

class ForumReplySerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    author_tag = serializers.CharField(source='author.player_tag', read_only=True)
    author_avatar_id = serializers.IntegerField(source='author.avatar_id', read_only=True)
    likes_count = serializers.SerializerMethodField()
    has_liked = serializers.SerializerMethodField()

    class Meta:
        model = ForumReply
        fields = [
            'id', 'thread', 'author', 'author_name', 'author_tag', 
            'author_avatar_id', 'content', 'created_at', 'likes_count', 'has_liked'
        ]
        read_only_fields = ['id', 'author', 'created_at']

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_has_liked(self, obj):
        request = self.context.get('request')
        if request and hasattr(request, 'player') and request.player:
            return obj.likes.filter(id=request.player.id).exists()
        return False

class LinkRequestSerializer(serializers.ModelSerializer):
    player_name = serializers.CharField(source='player.name', read_only=True)
    player_tag = serializers.CharField(source='player.player_tag', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    user_email = serializers.CharField(source='user.email', read_only=True)

    class Meta:
        model = LinkRequest
        fields = [
            'id', 'player', 'player_name', 'player_tag',
            'user', 'username', 'user_email',
            'club', 'status', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

class ClubConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClubConfig
        fields = ['max_senior_pct', 'weight_days', 'weight_ranked', 'weight_total', 'linkable_roles']
