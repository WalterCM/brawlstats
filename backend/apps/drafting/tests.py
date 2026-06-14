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

    @patch('requests.get')
    def test_sync_api_matches(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Create player, user
        player = Player.objects.create(name="Walter Test", player_tag="#TESTTAG123", supabase_auth_id="django-user-999")
        user = User.objects.create(username="user_999")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        # Setup mock BS API response for battle log (valid 3v3 team battle: 2 teams, 3 players each)
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
                                {'tag': '#TESTTAG123', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                }
            ]
        }

        # Create map in catalog
        map_obj = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab", is_ranked=True)

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call sync-api endpoint
        url = reverse('match-list') + 'sync-api/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['synced_count'], 1)

        # Verify a new Match and DraftEvents were created in the DB
        match = Match.objects.get(player=player, api_match_id='20260613T211812.000Z')
        self.assertEqual(match.map, map_obj)
        self.assertEqual(match.my_brawler, self.shelly)
        self.assertEqual(match.draft_events.count(), 6)

    @patch('requests.get')
    def test_sync_api_trophy_filtering(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Set player to ignore normal matches under 800 trophies
        player = Player.objects.create(
            name="Trophy Test Player", 
            player_tag="#TROPHYTAG", 
            supabase_auth_id="django-user-888",
            min_normal_trophies=800
        )
        user = User.objects.create(username="user_888")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        # Mock two normal battles from API:
        # Match A: Shelly, 500 trophies (should be skipped since 500 < 800 and no prior ranked match)
        # Match B: Colt, 900 trophies (should be imported since 900 >= 800)
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
                                {'tag': '#TROPHYTAG', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY', 'trophies': 500}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                },
                {
                    'battleTime': '20260613T221812.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'result': 'victory',
                        'teams': [
                            [
                                {'tag': '#TROPHYTAG', 'brawler': {'id': self.colt.id, 'name': 'COLT', 'trophies': 900}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ]
                        ]
                    }
                }
            ]
        }

        # Create normal/unranked map in catalog
        map_obj = Map.objects.create(id="88", name="Whisper Vale", mode="gemGrab", is_ranked=False)

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call sync-api endpoint
        url = reverse('match-list') + 'sync-api/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        # Only 1 match (the Colt one) should be synced
        self.assertEqual(response.json()['synced_count'], 1)

        self.assertTrue(Match.objects.filter(player=player, my_brawler=self.colt).exists())
        self.assertFalse(Match.objects.filter(player=player, my_brawler=self.shelly).exists())

    def test_draft_suggestions_trophy_filtering(self):
        # Authenticate player
        self.client.get(reverse('player-me'), **self.auth_headers)
        player = Player.objects.get(supabase_auth_id='supabase-test-uid-123')

        # Create normal matches with different trophies
        Match.objects.create(player=player, map=self.stone_fort, my_brawler=self.shelly, result='victory', draft_type='normal', my_brawler_trophies=1200)
        Match.objects.create(player=player, map=self.stone_fort, my_brawler=self.colt, result='victory', draft_type='normal', my_brawler_trophies=500)

        # Call DraftSuggestionView with min_trophies = 1000
        url = reverse('draft-suggest')
        data = {
            'map_id': self.stone_fort.id,
            'allies_picked': [],
            'enemies_picked': [],
            'allies_banned': [],
            'enemies_banned': [],
            'draft_type': 'normal',
            'min_trophies': 1000
        }
        response = self.client.post(url, data, format='json', **self.auth_headers)
        self.assertEqual(response.status_code, 200)

        suggestions = response.json()['suggestions']
        # Shelly should have higher score since her 1200 trophy match is counted, while Colt's 500 trophy match is filtered out
        shelly_sug = next(s for s in suggestions if s['brawler']['id'] == self.shelly.id)
        colt_sug = next(s for s in suggestions if s['brawler']['id'] == self.colt.id)
        self.assertGreater(shelly_sug['score'], colt_sug['score'])

    @patch('requests.get')
    def test_sync_api_mode_filtering(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Create player, user
        player = Player.objects.create(name="Mode Test Player", player_tag="#MODETAG", supabase_auth_id="django-user-777")
        user = User.objects.create(username="user_777")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        # Setup mock BS API response: 1 Gem Grab match (should sync) and 1 Basket Brawl match (should be skipped)
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
                                {'tag': '#MODETAG', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY', 'trophies': 900}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                },
                {
                    'battleTime': '20260613T221812.000Z',
                    'event': {'map': 'Ball Hog'},
                    'battle': {
                        'result': 'victory',
                        'teams': [
                            [
                                {'tag': '#MODETAG', 'brawler': {'id': self.colt.id, 'name': 'COLT', 'trophies': 900}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ]
                        ]
                    }
                }
            ]
        }

        # Create maps in catalog
        map_gem = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab", is_ranked=True)
        map_basket = Map.objects.create(id="101", name="Ball Hog", mode="Basket Brawl", is_ranked=False)

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call sync-api endpoint
        url = reverse('match-list') + 'sync-api/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        # Only the Gem Grab match should be synced
        self.assertEqual(response.json()['synced_count'], 1)

        self.assertTrue(Match.objects.filter(player=player, map=map_gem).exists())
        self.assertFalse(Match.objects.filter(player=player, map=map_basket).exists())

    @patch('requests.get')
    def test_sync_api_draft_type_resolution(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Set player to ignore normal matches under 750 trophies
        player = Player.objects.create(
            name="Draft Type Player", 
            player_tag="#DRAFTTAG", 
            supabase_auth_id="django-user-666",
            min_normal_trophies=750
        )
        user = User.objects.create(username="user_666")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        # Mock two battles:
        # Match A: played on a map that is ranked, but type="ranked" (trophy match) and brawler has 500 trophies (should be filtered out because it is normal)
        # Match B: played on the same map, type="soloRanked" (ranked mode match) and brawler has 500 trophies (should be imported because it is ranked mode)
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'items': [
                {
                    'battleTime': '20260613T211812.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'type': 'ranked', # Normal trophy match
                        'result': 'victory',
                        'teams': [
                            [
                                {'tag': '#DRAFTTAG', 'brawler': {'id': self.colt.id, 'name': 'COLT', 'trophies': 500}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY'}}
                            ]
                        ]
                    }
                },
                {
                    'battleTime': '20260613T221812.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'type': 'soloRanked', # Ranked match
                        'result': 'victory',
                        'teams': [
                            [
                                {'tag': '#DRAFTTAG', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY', 'trophies': 500}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                }
            ]
        }

        # Create map in catalog (marked as is_ranked=True)
        map_obj = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab", is_ranked=True)

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call sync-api endpoint
        url = reverse('match-list') + 'sync-api/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200)
        
        # Only the second match (soloRanked) should be synced
        self.assertEqual(response.json()['synced_count'], 1)

        # Verify the only synced match in the database has draft_type = 'ranked'
        self.assertEqual(Match.objects.filter(player=player).count(), 1)
        match = Match.objects.get(player=player)
        self.assertEqual(match.draft_type, 'ranked')
        self.assertEqual(match.api_match_id, '20260613T221812.000Z')

    @patch('requests.get')
    def test_last_battle_ingest_filters(self, mock_get):
        from django.contrib.auth.models import User
        from rest_framework.authtoken.models import Token

        # Set player to ignore normal matches under 750 trophies
        player = Player.objects.create(
            name="Ingest Filter Player", 
            player_tag="#INGESTTAG", 
            supabase_auth_id="django-user-555",
            min_normal_trophies=750
        )
        user = User.objects.create(username="user_555")
        player.supabase_auth_id = f"django-user-{user.id}"
        player.save()

        # Mock two battles in player's history:
        # 1. Match A (most recent, index 0): normal match with 500 trophies (should be skipped because of the 750 trophies filter)
        # 2. Match B (older, index 1): normal match with 800 trophies (should be selected because it passes the filter)
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            'items': [
                {
                    'battleTime': '20260614T010000.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'type': 'ranked', # Normal match
                        'result': 'victory',
                        'teams': [
                            [
                                {'tag': '#INGESTTAG', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY', 'trophies': 500}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                },
                {
                    'battleTime': '20260614T005000.000Z',
                    'event': {'map': 'Whisper Vale'},
                    'battle': {
                        'type': 'ranked', # Normal match
                        'result': 'defeat',
                        'teams': [
                            [
                                {'tag': '#INGESTTAG', 'brawler': {'id': self.shelly.id, 'name': 'SHELLY', 'trophies': 800}},
                                {'tag': '#ALLY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ALLY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ],
                            [
                                {'tag': '#ENEMY1', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY2', 'brawler': {'id': self.colt.id, 'name': 'COLT'}},
                                {'tag': '#ENEMY3', 'brawler': {'id': self.colt.id, 'name': 'COLT'}}
                            ]
                        ]
                    }
                }
            ]
        }

        # Create map in catalog
        map_obj = Map.objects.create(id="99", name="Whisper Vale", mode="gemGrab", is_ranked=True)

        token = Token.objects.create(user=user)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Token {token.key}'

        # Call the last-battle endpoint
        url = reverse('last-battle-ingest')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        
        # Verify it picked Match B (battleTime '20260614T005000.000Z', result 'defeat')
        self.assertEqual(response.json()['api_match_id'], '20260614T005000.000Z')
        self.assertEqual(response.json()['result'], 'defeat')

        # Now, create that match in the database to simulate that it is already recorded
        Match.objects.create(
            player=player,
            map=map_obj,
            my_brawler=self.shelly,
            result='defeat',
            api_match_id='20260614T005000.000Z',
            draft_type='normal',
            my_brawler_trophies=800
        )

        # Call last-battle again. It should fail with a 400 Bad Request because the match is already recorded.
        response2 = self.client.get(url)
        self.assertEqual(response2.status_code, 400)
        self.assertIn("already recorded", response2.json()['error'])




