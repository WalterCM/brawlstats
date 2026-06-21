from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework.authtoken.models import Token
from apps.core.models import Player
from apps.clubs.models import Club, ClubMember, ForumCategory, ForumThread, ForumReply

class ClubForumTests(APITestCase):
    def setUp(self):
        # Create users & players
        self.user1 = User.objects.create_user(username='player1', password='password123')
        self.player1 = Player.objects.create(
            name='Player One',
            supabase_auth_id=f"django-user-{self.user1.id}",
            player_tag='#PLAYER1'
        )
        self.token1 = Token.objects.create(user=self.user1)

        self.user2 = User.objects.create_user(username='player2', password='password123')
        self.player2 = Player.objects.create(
            name='Player Two',
            supabase_auth_id=f"django-user-{self.user2.id}",
            player_tag='#PLAYER2'
        )
        self.token2 = Token.objects.create(user=self.user2)

        # Authenticate player 1 by default
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')

    def test_create_club(self):
        # Create club as non-staff should fail
        response = self.client.post('/api/clubs/', {'name': 'Brawl Champions', 'tag': '#CHAMP123', 'description': 'The best club'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Make user staff
        self.user1.is_staff = True
        self.user1.save()

        # Create club as staff should succeed
        response = self.client.post('/api/clubs/', {'name': 'Brawl Champions', 'tag': '#CHAMP123', 'description': 'The best club'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Club.objects.count(), 1)
        self.assertEqual(ClubMember.objects.count(), 1)
        
        # Verify creator is president and approved
        membership = ClubMember.objects.get(player=self.player1)
        self.assertEqual(membership.role, 'president')
        self.assertTrue(membership.is_approved)
        self.assertEqual(membership.club.name, 'Brawl Champions')

        # Verify default categories were created
        self.assertEqual(ForumCategory.objects.filter(club=membership.club).count(), 3)

    def test_request_join_and_approve(self):
        # Setup: Player 1 has a club
        club = Club.objects.create(name='Brawl Champions', tag='#CHAMP123')
        ClubMember.objects.create(club=club, player=self.player1, role='president', is_approved=True)

        # Player 2 requests to join
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token2.key}')
        response = self.client.post(f'/api/clubs/{club.id}/request_join/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check membership is pending
        membership = ClubMember.objects.get(player=self.player2)
        self.assertFalse(membership.is_approved)
        self.assertEqual(membership.role, 'member')

        # Player 2 cannot access my_club as approved
        response = self.client.get('/api/clubs/my_club/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['in_club'])
        self.assertFalse(response.data['is_approved'])
        self.assertEqual(response.data['pending_club']['id'], club.id)

        # Player 1 (president) approves Player 2
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        response = self.client.post(f'/api/clubs/{club.id}/approve_member/', {'player_id': self.player2.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify Player 2 is approved now
        membership.refresh_from_db()
        self.assertTrue(membership.is_approved)

    def test_forum_permissions(self):
        # Setup: Club and members
        club = Club.objects.create(name='Brawl Champions', tag='#CHAMP123')
        ClubMember.objects.create(club=club, player=self.player1, role='president', is_approved=True)
        category = ForumCategory.objects.create(club=club, name='General')

        # Player 2 (non-member) tries to list categories
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token2.key}')
        response = self.client.get('/api/forum/categories/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Player 2 requests to join but is pending
        ClubMember.objects.create(club=club, player=self.player2, role='member', is_approved=False)
        response = self.client.get('/api/forum/categories/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Player 1 (president) approves Player 2
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        self.client.post(f'/api/clubs/{club.id}/approve_member/', {'player_id': self.player2.id})

        # Player 2 (approved member) lists categories
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token2.key}')
        response = self.client.get('/api/forum/categories/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        # Player 2 creates a thread
        response = self.client.post('/api/forum/threads/', {
            'category': category.id,
            'title': 'Tips for Ranked',
            'content': 'Use tank on bushy maps!'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        thread_id = response.data['id']

        # Player 1 replies to thread
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token1.key}')
        response = self.client.post('/api/forum/replies/', {
            'thread': thread_id,
            'content': 'I agree, Buster is great here.'
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
