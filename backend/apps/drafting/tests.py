from django.test import TestCase, Client
from django.urls import reverse
from apps.core.models import Player, Brawler, Map
from apps.matches.models import Match, DraftEvent
from apps.drafting.models import Perception
from unittest.mock import patch

class DraftAssistantTests(TestCase):
    def setUp(self):
        # Create test Client
        self.client = Client()

        # Seed initial catalog items
        self.shelly = Brawler.objects.create(id="16000000", name="Shelly", class_name="Damage Dealer")
        self.colt = Brawler.objects.create(id="16000001", name="Colt", class_name="Damage Dealer")
        self.bull = Brawler.objects.create(id="16000002", name="Bull", class_name="Tank")
        
        self.stone_fort = Map.objects.create(id="15000001", name="Stone Fort", mode="Gem Grab", is_ranked=True)

        # Set HTTP Headers for Supabase Middleware Authentication
        self.auth_headers = {
            'HTTP_X_SUPABASE_USER_ID': 'supabase-test-uid-123',
            'HTTP_X_SUPABASE_USER_NAME': 'TestPlayer'
        }

    def test_supabase_auth_middleware(self):
        # Test request to me endpoint with headers
        response = self.client.get(reverse('player-me'), **self.auth_headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['name'], 'TestPlayer')
        self.assertEqual(response.json()['supabase_auth_id'], 'supabase-test-uid-123')

        # Verify Player object was created in database
        player_exists = Player.objects.filter(supabase_auth_id='supabase-test-uid-123').exists()
        self.assertTrue(player_exists)

    def test_post_match_and_draft_events(self):
        # Authenticate player first
        self.client.get(reverse('player-me'), **self.auth_headers)
        
        # Post match details
        payload = {
            "map_id": self.stone_fort.id,
            "my_brawler_id": self.shelly.id,
            "mode": "Gem Grab",
            "result": "victory",
            "draft_events": [
                {"type": "ban", "brawler_id": self.bull.id, "team": "enemy", "order": 1},
                {"type": "pick", "brawler_id": self.shelly.id, "team": "allied", "order": 2},
                {"type": "pick", "brawler_id": self.colt.id, "team": "enemy", "order": 3}
            ]
        }
        
        response = self.client.post(
            reverse('match-list'), 
            payload, 
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 201)
        
        # Verify Match and Draft Events exist in DB
        self.assertEqual(Match.objects.count(), 1)
        self.assertEqual(DraftEvent.objects.count(), 3)
        
        match = Match.objects.first()
        self.assertEqual(match.my_brawler, self.shelly)
        self.assertEqual(match.result, "victory")

    def test_draft_suggestions(self):
        # Add some historical match to give Shelly a win and Colt a loss
        player = Player.objects.create(name="TestPlayer", supabase_auth_id="supabase-test-uid-123")
        
        # Shelly: 1 match, 1 victory
        m1 = Match.objects.create(player=player, map=self.stone_fort, my_brawler=self.shelly, mode="Gem Grab", result="victory")
        
        # Colt: 1 match, 0 victories (defeat)
        m2 = Match.objects.create(player=player, map=self.stone_fort, my_brawler=self.colt, mode="Gem Grab", result="defeat")

        # Set up draft request
        payload = {
            "map_id": self.stone_fort.id,
            "allies_picked": [],
            "enemies_picked": [self.bull.id],
            "allies_banned": [],
            "enemies_banned": []
        }

        response = self.client.post(
            reverse('draft-suggest'),
            payload,
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        
        suggestions = response.json()['suggestions']
        self.assertTrue(len(suggestions) > 0)
        
        # Shelly should rank higher than Colt because of her 100% win rate vs Colt's 0%
        shelly_score = next(item for item in suggestions if item['brawler']['id'] == self.shelly.id)['score']
        colt_score = next(item for item in suggestions if item['brawler']['id'] == self.colt.id)['score']
        
        self.assertGreater(shelly_score, colt_score)

    def test_perception_upsert(self):
        # Authenticate
        self.client.get(reverse('player-me'), **self.auth_headers)
        player = Player.objects.get(supabase_auth_id='supabase-test-uid-123')
        
        # Create a match
        match = Match.objects.create(player=player, map=self.stone_fort, my_brawler=self.shelly, mode="Gem Grab", result="victory")

        payload = {
            "match_id": match.id,
            "my_brawler_id": self.shelly.id,
            "brawler_rival_id": self.bull.id,
            "value": -2  # Counter
        }

        # Create perception
        response = self.client.post(
            reverse('perception-list'),
            payload,
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Perception.objects.count(), 1)
        self.assertEqual(Perception.objects.first().value, -2)

        # Update perception
        payload["value"] = 1  # Easy
        response = self.client.post(
            reverse('perception-list'),
            payload,
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Perception.objects.count(), 1)
        self.assertEqual(Perception.objects.first().value, 1)

    def test_draft_suggestions_with_mode_filtered_perceptions(self):
        # Authenticate
        self.client.get(reverse('player-me'), **self.auth_headers)
        player = Player.objects.get(supabase_auth_id='supabase-test-uid-123')

        # Create two maps: Gem Grab (same mode as draft) and Brawl Ball (different mode)
        gem_grab_map = self.stone_fort  # Gem Grab
        brawl_ball_map = Map.objects.create(id="15000002", name="Sneaky Fields", mode="Brawl Ball", is_ranked=True)

        # Create matches
        m_gem_grab = Match.objects.create(player=player, map=gem_grab_map, my_brawler=self.shelly, mode="Gem Grab", result="victory")
        m_brawl_ball = Match.objects.create(player=player, map=brawl_ball_map, my_brawler=self.shelly, mode="Brawl Ball", result="victory")

        # Create perceptions for Shelly vs Colt
        # 1. Gem Grab perception: Shelly vs Colt is Easy (1)
        Perception.objects.create(match=m_gem_grab, player=player, my_brawler=self.shelly, brawler_rival=self.colt, value=1)
        # 2. Brawl Ball perception: Shelly vs Colt is Counter (-2)
        Perception.objects.create(match=m_brawl_ball, player=player, my_brawler=self.shelly, brawler_rival=self.colt, value=-2)

        # Suggest for Gem Grab map -> Should filter and only use Gem Grab perception (value=1 -> factor=1.15)
        payload = {
            "map_id": gem_grab_map.id,
            "allies_picked": [],
            "enemies_picked": [self.colt.id],
            "allies_banned": [],
            "enemies_banned": []
        }
        response = self.client.post(
            reverse('draft-suggest'),
            payload,
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        suggestions = response.json()['suggestions']
        shelly_score_gem_grab = next(item for item in suggestions if item['brawler']['id'] == self.shelly.id)['score']

        # Suggest for a different map (e.g. Brawl Ball map) -> Should filter and use Brawl Ball perception (value=-2 -> factor=0.65)
        payload["map_id"] = brawl_ball_map.id
        response = self.client.post(
            reverse('draft-suggest'),
            payload,
            content_type='application/json',
            **self.auth_headers
        )
        self.assertEqual(response.status_code, 200)
        suggestions2 = response.json()['suggestions']
        shelly_score_brawl_ball = next(item for item in suggestions2 if item['brawler']['id'] == self.shelly.id)['score']

        # Shelly should have a significantly higher score in Gem Grab than Brawl Ball due to perception filtering
        self.assertGreater(shelly_score_gem_grab, shelly_score_brawl_ball)

    @patch('requests.get')
    def test_passwordless_access_existing_player(self, mock_get):
        # Mock requests.get response
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'name': 'Walter Test',
            'tag': '#TESTTAG123'
        }

        # Create a player with a tag
        player = Player.objects.create(name="Walter Test", player_tag="#TESTTAG123", supabase_auth_id="some-id")

        # Access via player_tag
        payload = {
            "player_tag": "#TESTTAG123"
        }
        response = self.client.post(
            reverse('player-access'),
            payload,
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('token', data)
        self.assertEqual(data['username'], 'Walter Test')
        self.assertEqual(data['player_tag'], '#TESTTAG123')

        # Test list view includes this player
        list_response = self.client.get(reverse('player-list'))
        self.assertEqual(list_response.status_code, 200)
        list_data = list_response.json()
        self.assertTrue(any(p['player_tag'] == '#TESTTAG123' for p in list_data))

    @patch('requests.get')
    def test_link_api_match(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Setup mock BS API response for battle log
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'items': [
                {
                    'battleTime': '20260613T211812.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'result': 'victory',
                        'teams': [
                            [
                                {
                                    'tag': '#TESTTAG123',
                                    'brawler': {'id': 16000000, 'name': 'LEON'}
                                }
                            ],
                            []
                        ]
                    }
                }
            ]
        }

        # Create player, brawler, map, and a manual unlinked match
        player = Player.objects.create(name="Walter Test", player_tag="#TESTTAG123", supabase_auth_id="django-user-999")
        user = User.objects.create(username="user_999")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        brawler = Brawler.objects.create(id="16000022", name="LEON")
        map_obj = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab")
        match = Match.objects.create(
            player=player,
            map=map_obj,
            my_brawler=brawler,
            mode="gemGrab",
            result="victory",
            draft_type="ranked"
        )

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call link-api endpoint
        url = reverse('match-detail', kwargs={'pk': match.id}) + 'link-api/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, 200)
        match.refresh_from_db()
        self.assertEqual(match.api_match_id, '20260613T211812.000Z')

    def test_perception_neutral_value_is_deleted_or_not_saved(self):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Create player, brawler, map, match
        player = Player.objects.create(name="Walter Test", player_tag="#TESTTAG123", supabase_auth_id="django-user-999")
        user = User.objects.create(username="user_999")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        brawler = self.shelly
        rival = self.colt
        map_obj = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab")
        match = Match.objects.create(
            player=player,
            map=map_obj,
            my_brawler=brawler,
            mode="gemGrab",
            result="victory",
            draft_type="ranked"
        )

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Create an initial easy perception
        Perception.objects.create(
            match=match,
            player=player,
            my_brawler=brawler,
            brawler_rival=rival,
            value=1
        )
        self.assertEqual(Perception.objects.filter(match=match, brawler_rival=rival).count(), 1)

        # Send a POST payload with value=0 (neutral) to update it
        url = reverse('perception-list')
        payload = {
            "match_id": match.id,
            "brawler_rival_id": rival.id,
            "value": 0
        }
        response = self.client.post(url, payload, content_type='application/json')
        self.assertEqual(response.status_code, 201)

        # Verify the perception record has been DELETED from the database
        self.assertEqual(Perception.objects.filter(match=match, brawler_rival=rival).count(), 0)
