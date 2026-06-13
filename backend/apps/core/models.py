from django.db import models

class Player(models.Model):
    name = models.CharField(max_length=100)
    supabase_auth_id = models.CharField(max_length=255, unique=True, db_index=True)
    player_tag = models.CharField(max_length=50, blank=True, null=True)
    avatar_id = models.IntegerField(blank=True, null=True)

    def __str__(self):
        return f"{self.name} ({self.supabase_auth_id[:8]})"

class Brawler(models.Model):
    id = models.CharField(max_length=50, primary_key=True)  # From brawlapi.com (string ID)
    name = models.CharField(max_length=100)
    image_url = models.URLField(max_length=500, blank=True, null=True)
    class_name = models.CharField(max_length=100, blank=True, null=True)  # e.g., Assassin, Tank, etc.

    def __str__(self):
        return self.name

class Map(models.Model):
    id = models.CharField(max_length=50, primary_key=True)  # From brawlapi.com (string ID)
    name = models.CharField(max_length=100)
    mode = models.CharField(max_length=100)  # e.g., gemGrab, brawlBall
    image_url = models.URLField(max_length=500, blank=True, null=True)
    is_ranked = models.BooleanField(default=False)  # Whether it's currently in the Ranked pool

    def __str__(self):
        return f"{self.name} ({self.mode})"
