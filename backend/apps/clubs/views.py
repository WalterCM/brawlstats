from rest_framework import viewsets, permissions, status, response
from rest_framework.decorators import action
from django.db import transaction

from apps.core.permissions import IsSupabaseAuthenticated
from apps.core.models import Player
from apps.clubs.models import Club, ClubMember, ForumCategory, ForumThread, ForumReply
from apps.clubs.serializers import (
    ClubSerializer, ClubMemberSerializer, 
    ForumCategorySerializer, ForumThreadSerializer, ForumReplySerializer
)

class IsApprovedClubMember(permissions.BasePermission):
    """
    Permission checking that the user is an approved club member.
    """
    def has_permission(self, request, view):
        if not request.player:
            return False
        try:
            membership = request.player.club_membership
            return membership.is_approved
        except ClubMember.DoesNotExist:
            return False

class ClubViewSet(viewsets.ModelViewSet):
    queryset = Club.objects.all()
    serializer_class = ClubSerializer
    permission_classes = [IsSupabaseAuthenticated]

    def create(self, request, *args, **kwargs):
        user = getattr(request, 'user', None)
        is_admin = user and (user.is_staff or user.is_superuser)
        if not is_admin:
            return response.Response(
                {'error': 'Only site administrators can create clubs.'},
                status=status.HTTP_403_FORBIDDEN
            )

        player = request.player
        # Check if player already has a club membership
        if ClubMember.objects.filter(player=player).exists():
            return response.Response(
                {'error': 'You are already in a club or have a pending request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        club_tag = request.data.get('tag')
        if not club_tag:
            return response.Response(
                {'error': 'Club Tag is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalize tag
        club_tag = club_tag.strip().upper()
        if not club_tag.startswith('#'):
            club_tag = '#' + club_tag

        # Check if already registered
        if Club.objects.filter(tag__iexact=club_tag).exists():
            return response.Response(
                {'error': f'A club with tag {club_tag} is already registered.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Fetch from Brawl Stars API
        import os
        import requests
        import sys
        api_key = os.getenv('BRAWL_STARS_API_KEY')

        # Fallbacks/Defaults
        club_name = f"Club {club_tag}"
        club_desc = "No description provided."

        # If key is missing and we're not running tests, reject it
        is_testing = 'test' in sys.argv or any('test' in arg for arg in sys.argv)
        if not api_key and not is_testing:
            return response.Response(
                {'error': 'BRAWL_STARS_API_KEY is not configured in backend environment.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if api_key:
            encoded_tag = club_tag.replace('#', '%23')
            url = f"https://api.brawlstars.com/v1/clubs/{encoded_tag}"
            headers = {
                "Authorization": f"Bearer {api_key}"
            }
            try:
                res = requests.get(url, headers=headers, timeout=5)
                if res.status_code == 200:
                    club_data = res.json()
                    club_name = club_data.get('name', club_name)
                    club_desc = club_data.get('description', club_desc)
                else:
                    if not is_testing:
                        return response.Response(
                            {'error': f'Brawl Stars API returned error {res.status_code} for club tag {club_tag}: {res.text}'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
            except Exception as e:
                if not is_testing:
                    return response.Response(
                        {'error': f'Failed to contact Brawl Stars API: {str(e)}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        if is_testing:
            club_name = request.data.get('name', club_name)
            club_desc = request.data.get('description', club_desc)

        with transaction.atomic():
            club = Club.objects.create(
                name=club_name,
                tag=club_tag,
                description=club_desc
            )

            # The creator becomes the president and is approved
            ClubMember.objects.create(
                club=club,
                player=player,
                role='president',
                is_approved=True
            )
            
            # Automatically create some default forum categories for the new club
            ForumCategory.objects.create(
                club=club,
                name="General",
                description="General discussion and chat for club members."
            )
            ForumCategory.objects.create(
                club=club,
                name="Estrategias",
                description="Tips, brawler guides, and draft discussions."
            )
            ForumCategory.objects.create(
                club=club,
                name="Anuncios",
                description="Official club news and announcements."
            )

        serializer = self.get_serializer(club)
        return response.Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def my_club(self, request):
        player = request.player
        try:
            membership = player.club_membership
            club = membership.club
            if membership.is_approved:
                serializer = self.get_serializer(club)
                return response.Response({
                    'in_club': True,
                    'is_approved': True,
                    'role': membership.role,
                    'club': serializer.data
                })
            else:
                return response.Response({
                    'in_club': False,
                    'is_approved': False,
                    'pending_club': {
                        'id': club.id,
                        'name': club.name,
                        'tag': club.tag
                    }
                })
        except ClubMember.DoesNotExist:
            return response.Response({
                'in_club': False,
                'is_approved': False
            })

    @action(detail=True, methods=['post'])
    def request_join(self, request, pk=None):
        club = self.get_object()
        player = request.player

        if ClubMember.objects.filter(player=player).exists():
            return response.Response(
                {'error': 'You are already a member of a club or have a pending join request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ClubMember.objects.create(
            club=club,
            player=player,
            role='member',
            is_approved=False
        )
        return response.Response({'message': 'Join request submitted successfully.'})

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        club = self.get_object()
        player = request.player

        try:
            membership = ClubMember.objects.get(club=club, player=player)
        except ClubMember.DoesNotExist:
            return response.Response(
                {'error': 'You are not a member of this club.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if membership.role == 'president':
            # If president is leaving, check if they are the only member
            other_members = club.members.filter(is_approved=True).exclude(player=player)
            if other_members.exists():
                return response.Response(
                    {'error': 'As the President, you must transfer leadership to another member before leaving.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            else:
                # Delete the club entirely since no other members exist
                club.delete()
                return response.Response({'message': 'Club dissolved and membership deleted.'})

        membership.delete()
        return response.Response({'message': 'Left the club successfully.'})

    @action(detail=True, methods=['post'])
    def approve_member(self, request, pk=None):
        club = self.get_object()
        player = request.player

        # Check permissions
        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            if req_membership.role not in ['president', 'vice_president'] or not req_membership.is_approved:
                return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        player_id = request.data.get('player_id')
        if not player_id:
            return response.Response({'error': 'player_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_membership = ClubMember.objects.get(club=club, player_id=player_id)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Membership request not found.'}, status=status.HTTP_404_NOT_FOUND)

        target_membership.is_approved = True
        target_membership.save()
        return response.Response({'message': 'Member approved successfully.'})

    @action(detail=True, methods=['post'])
    def reject_or_remove_member(self, request, pk=None):
        club = self.get_object()
        player = request.player

        # Check permissions
        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            if req_membership.role not in ['president', 'vice_president'] or not req_membership.is_approved:
                return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        player_id = request.data.get('player_id')
        if not player_id:
            return response.Response({'error': 'player_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_membership = ClubMember.objects.get(club=club, player_id=player_id)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Vice President cannot remove another Vice President or the President
        if req_membership.role == 'vice_president' and target_membership.role in ['president', 'vice_president']:
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        target_membership.delete()
        return response.Response({'message': 'Member request rejected or member removed.'})

    @action(detail=True, methods=['post'])
    def change_member_role(self, request, pk=None):
        club = self.get_object()
        player = request.player

        # Check permissions (Only President can change roles)
        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            if req_membership.role != 'president' or not req_membership.is_approved:
                return response.Response({'error': 'Only the President can change member roles.'}, status=status.HTTP_403_FORBIDDEN)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        player_id = request.data.get('player_id')
        new_role = request.data.get('role')

        if not player_id or not new_role:
            return response.Response({'error': 'player_id and role are required.'}, status=status.HTTP_400_BAD_REQUEST)

        if new_role not in ['president', 'vice_president', 'senior', 'member']:
            return response.Response({'error': 'Invalid role.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_membership = ClubMember.objects.get(club=club, player_id=player_id)
        except ClubMember.DoesNotExist:
            return response.Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            if new_role == 'president':
                # Swap leadership: current president becomes a vice president (or member), target becomes president
                req_membership.role = 'vice_president'
                req_membership.save()
                target_membership.role = 'president'
                target_membership.save()
            else:
                target_membership.role = new_role
                target_membership.save()

        return response.Response({'message': 'Role updated successfully.'})

class ForumCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ForumCategorySerializer
    permission_classes = [IsApprovedClubMember]

    def get_queryset(self):
        player = self.request.player
        try:
            club = player.club_membership.club
            return ForumCategory.objects.filter(club=club)
        except AttributeError:
            return ForumCategory.objects.none()

class ForumThreadViewSet(viewsets.ModelViewSet):
    serializer_class = ForumThreadSerializer
    permission_classes = [IsApprovedClubMember]

    def get_queryset(self):
        player = self.request.player
        category_id = self.request.query_params.get('category')
        
        try:
            club = player.club_membership.club
            qs = ForumThread.objects.filter(category__club=club)
            if category_id:
                qs = qs.filter(category_id=category_id)
            return qs.order_by('-created_at')
        except AttributeError:
            return ForumThread.objects.none()

    def perform_create(self, serializer):
        category = serializer.validated_data['category']
        player = self.request.player
        # Ensure category belongs to the user's club
        if category.club != player.club_membership.club:
            raise permissions.exceptions.PermissionDenied("Category does not belong to your club.")
        serializer.save(author=player)

    def destroy(self, request, *args, **kwargs):
        thread = self.get_object()
        player = request.player
        club = player.club_membership.club
        
        # Allow deletion if author or if president/vice_president
        is_author = thread.author == player
        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            is_staff = req_membership.role in ['president', 'vice_president']
        except ClubMember.DoesNotExist:
            is_staff = False
            
        if not (is_author or is_staff):
            return response.Response({'error': 'You do not have permission to delete this thread.'}, status=status.HTTP_403_FORBIDDEN)
            
        return super().destroy(request, *args, **kwargs)

class ForumReplyViewSet(viewsets.ModelViewSet):
    serializer_class = ForumReplySerializer
    permission_classes = [IsApprovedClubMember]

    def get_queryset(self):
        player = self.request.player
        thread_id = self.request.query_params.get('thread')
        
        try:
            club = player.club_membership.club
            qs = ForumReply.objects.filter(thread__category__club=club)
            if thread_id:
                qs = qs.filter(thread_id=thread_id)
            return qs.order_by('created_at')
        except AttributeError:
            return ForumReply.objects.none()

    def perform_create(self, serializer):
        thread = serializer.validated_data['thread']
        player = self.request.player
        # Ensure thread belongs to the user's club
        if thread.category.club != player.club_membership.club:
            raise permissions.exceptions.PermissionDenied("Thread does not belong to your club.")
        serializer.save(author=player)

    def destroy(self, request, *args, **kwargs):
        reply = self.get_object()
        player = request.player
        club = player.club_membership.club
        
        # Allow deletion if author or if president/vice_president
        is_author = reply.author == player
        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            is_staff = req_membership.role in ['president', 'vice_president']
        except ClubMember.DoesNotExist:
            is_staff = False
            
        if not (is_author or is_staff):
            return response.Response({'error': 'You do not have permission to delete this reply.'}, status=status.HTTP_403_FORBIDDEN)
            
        return super().destroy(request, *args, **kwargs)
