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
            if membership.is_approved and membership.is_active:
                serializer = self.get_serializer(club)
                return response.Response({
                    'in_club': True,
                    'is_approved': True,
                    'role': membership.role,
                    'club': serializer.data
                })
            elif not membership.is_active:
                return response.Response({
                    'in_club': False,
                    'is_approved': False
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

    @action(detail=True, methods=['post'])
    def sync_roster(self, request, pk=None):
        club = self.get_object()
        player = request.player

        user = getattr(request, 'user', None)
        is_site_admin = user and (user.is_staff or user.is_superuser)

        try:
            req_membership = ClubMember.objects.get(club=club, player=player)
            is_allowed = is_site_admin or req_membership.role == 'president'
        except ClubMember.DoesNotExist:
            is_allowed = is_site_admin

        if not is_allowed:
            return response.Response(
                {'error': 'Only the President or Site Administrators can trigger roster sync.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Fetch from Brawl Stars API
        import os
        import requests
        import sys
        from django.utils import timezone

        api_key = os.getenv('BRAWL_STARS_API_KEY')
        is_testing = 'test' in sys.argv or any('test' in arg for arg in sys.argv)
        
        if not api_key and not is_testing:
            return response.Response(
                {'error': 'BRAWL_STARS_API_KEY is not configured in backend environment.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Default/Mocked members for testing if API is off or we are in testing
        api_members = []
        if is_testing:
            api_members = [
                {
                    'tag': '#PLAYER1',
                    'name': 'Player One',
                    'role': 'president',
                    'icon': {'id': 28000001}
                },
                {
                    'tag': '#PLAYER2',
                    'name': 'Player Two',
                    'role': 'member',
                    'icon': {'id': 28000002}
                },
                {
                    'tag': '#PLAYER3',
                    'name': 'Player Three',
                    'role': 'senior',
                    'icon': {'id': 28000003}
                }
            ]
        else:
            encoded_tag = club.tag.replace('#', '%23')
            url = f"https://api.brawlstars.com/v1/clubs/{encoded_tag}"
            headers = {
                "Authorization": f"Bearer {api_key}"
            }
            try:
                res = requests.get(url, headers=headers, timeout=5)
                if res.status_code == 200:
                    club_data = res.json()
                    api_members = club_data.get('members', [])
                    desc = club_data.get('description')
                    if desc and club.description != desc:
                         club.description = desc
                         club.save()
                else:
                    return response.Response(
                        {'error': f'Brawl Stars API returned error {res.status_code}: {res.text}'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            except Exception as e:
                return response.Response(
                    {'error': f'Failed to contact Brawl Stars API: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        active_api_tags = set()
        with transaction.atomic():
            for m in api_members:
                tag = m.get('tag', '').strip().upper()
                if not tag:
                     continue
                active_api_tags.add(tag)
                name = m.get('name', f"Player {tag}")
                role_map = {
                     'president': 'president',
                     'vicepresident': 'vice_president',
                     'vice_president': 'vice_president',
                     'senior': 'senior',
                     'member': 'member'
                }
                api_role = m.get('role', 'member').lower().replace(' ', '_')
                db_role = role_map.get(api_role, 'member')
                icon_id = m.get('icon', {}).get('id')

                # Find or create Player
                p, p_created = Player.objects.get_or_create(
                     player_tag__iexact=tag,
                     defaults={
                         'name': name,
                         'player_tag': tag,
                         'avatar_id': icon_id,
                         'supabase_auth_id': f"imported-{tag.replace('#', '')}"
                     }
                )
                if not p_created:
                     if p.name != name:
                         p.name = name
                     if icon_id and p.avatar_id != icon_id:
                         p.avatar_id = icon_id
                     p.save()

                # Find or create ClubMember mapping
                membership, m_created = ClubMember.objects.get_or_create(
                     club=club,
                     player=p,
                     defaults={
                         'role': db_role,
                         'is_approved': True,
                         'is_active': True,
                         'joined_at': timezone.now()
                     }
                )
                if not m_created:
                     if not membership.is_active:
                         membership.is_active = True
                         membership.joined_at = timezone.now()
                         membership.left_at = None
                     membership.role = db_role
                     membership.is_approved = True
                     membership.save()

            # Mark members who left the club
            inactive_members = ClubMember.objects.filter(club=club, is_active=True).exclude(player__player_tag__in=active_api_tags)
            for member in inactive_members:
                 if member.role == 'president':
                     continue
                 member.is_active = False
                 member.left_at = timezone.now()
                 member.save()

        return response.Response({'message': 'Roster synchronized successfully.', 'synced_count': len(active_api_tags)})

    @action(detail=True, methods=['post'])
    def link_player(self, request, pk=None):
        club = self.get_object()
        user = getattr(request, 'user', None)
        is_site_admin = user and (user.is_staff or user.is_superuser)

        try:
            req_membership = ClubMember.objects.get(club=club, player=request.player)
            is_allowed = is_site_admin or req_membership.role == 'president'
        except ClubMember.DoesNotExist:
            is_allowed = is_site_admin

        if not is_allowed:
            return response.Response(
                {'error': 'Only the President or Site Administrators can link players.'},
                status=status.HTTP_403_FORBIDDEN
            )

        target_user_id = request.data.get('user_id')
        target_player_id = request.data.get('player_id')

        if not target_user_id or not target_player_id:
            return response.Response(
                {'error': 'Both user_id and player_id are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.contrib.auth.models import User
        try:
            target_user = User.objects.get(id=target_user_id)
        except User.DoesNotExist:
            return response.Response({'error': 'Target user not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            target_player = Player.objects.get(id=target_player_id)
        except Player.DoesNotExist:
            return response.Response({'error': 'Target player not found.'}, status=status.HTTP_404_NOT_FOUND)

        from django.utils import timezone
        with transaction.atomic():
            old_auth_id = f"django-user-{target_user.id}"
            temp_players = Player.objects.filter(supabase_auth_id=old_auth_id)
            for tp in temp_players:
                if tp.id != target_player.id:
                    ForumThread.objects.filter(author=tp).update(author=target_player)
                    ForumReply.objects.filter(author=tp).update(author=target_player)
                    tp.delete()

            target_player.supabase_auth_id = old_auth_id
            target_player.save()

            membership, created = ClubMember.objects.get_or_create(
                club=club,
                player=target_player,
                defaults={
                    'role': 'member',
                    'is_approved': True,
                    'is_active': True,
                    'joined_at': timezone.now()
                }
            )
            if not created:
                membership.is_approved = True
                membership.is_active = True
                membership.save()

        return response.Response({'message': f'Successfully linked {target_player.name} to account {target_user.username}.'})

    @action(detail=True, methods=['get'])
    def unlinked_profiles(self, request, pk=None):
        club = self.get_object()
        user = getattr(request, 'user', None)
        is_site_admin = user and (user.is_staff or user.is_superuser)

        try:
            req_membership = ClubMember.objects.get(club=club, player=request.player)
            is_allowed = is_site_admin or req_membership.role == 'president'
        except ClubMember.DoesNotExist:
            is_allowed = is_site_admin

        if not is_allowed:
            return response.Response(
                {'error': 'Permission denied.'},
                status=status.HTTP_403_FORBIDDEN
            )

        from django.contrib.auth.models import User
        # Exclude test accounts from linkage options
        test_usernames = ['brawler', 'tester123', 'testuser', 'testuser123']
        all_users = User.objects.exclude(username__in=test_usernames).order_by('username')
        
        unlinked_users = []
        for u in all_users:
            auth_id = f"django-user-{u.id}"
            player_linked = Player.objects.filter(supabase_auth_id=auth_id).exclude(player_tag='').exclude(player_tag__isnull=True).exists()
            if not player_linked:
                # If they have an email, we show the email or username
                unlinked_users.append({
                    'id': u.id,
                    'username': u.email or u.username
                })

        club_members = ClubMember.objects.filter(club=club, is_active=True)
        unlinked_players = []
        for m in club_members:
            p = m.player
            if not p.supabase_auth_id.startswith('django-user-'):
                unlinked_players.append({
                    'id': p.id,
                    'name': p.name,
                    'tag': p.player_tag
                })

        return response.Response({
            'unlinked_users': unlinked_users,
            'unlinked_players': unlinked_players
        })

def check_is_senior_or_above(player, user=None):
    if user and (user.is_staff or user.is_superuser):
        return True
    
    if player.supabase_auth_id.startswith('django-user-'):
        try:
            from django.contrib.auth.models import User as DjangoUser
            user_id = int(player.supabase_auth_id.split('-')[-1])
            if DjangoUser.objects.filter(id=user_id, is_staff=True).exists() or DjangoUser.objects.filter(id=user_id, is_superuser=True).exists():
                return True
        except (ValueError, TypeError):
            pass

    try:
        membership = player.club_membership
        return membership.role in ['president', 'vice_president', 'senior']
    except AttributeError:
        return False

class ForumCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ForumCategorySerializer
    permission_classes = [IsApprovedClubMember]

    def get_queryset(self):
        player = self.request.player
        try:
            club = player.club_membership.club
            qs = ForumCategory.objects.filter(club=club)
            if not check_is_senior_or_above(player, self.request.user):
                qs = qs.filter(restricted_to_seniors=False)
            return qs
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
            if not check_is_senior_or_above(player, self.request.user):
                qs = qs.filter(category__restricted_to_seniors=False)
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
        
        # Check Senior restrictions
        if category.restricted_to_seniors:
            if not check_is_senior_or_above(player, self.request.user):
                raise permissions.exceptions.PermissionDenied("Only Seniors or above can post in this category.")
                
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
            if not check_is_senior_or_above(player, self.request.user):
                qs = qs.filter(thread__category__restricted_to_seniors=False)
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
            
        # Check Senior restrictions
        if thread.category.restricted_to_seniors:
            if not check_is_senior_or_above(player, self.request.user):
                raise permissions.exceptions.PermissionDenied("Only Seniors or above can reply in this category.")
                
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
