from django.test import TestCase, Client
from django.urls import reverse
from apps.core.models import Player, Brawler, Map
from apps.matches.models import Match, DraftEvent
from apps.drafting.models import Perception
from apps.brawlers.models import MetaBrawlerStats, MetaMatchup, MetaMapStats

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

        payload = {
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
