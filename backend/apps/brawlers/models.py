from django.db import models
from apps.core.models import Brawler, Map

class MetaBrawlerStats(models.Model):
    brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='meta_stats')
    win_rate = models.FloatField()
    pick_rate = models.FloatField()
    date = models.DateField(auto_now_add=True)
    tier = models.IntegerField(default=2)  # Global is Tier 2
    last_synced = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.brawler.name} - WR: {self.win_rate * 100:.1f}%"

class MetaMatchup(models.Model):
    brawler_a = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='meta_matchups_as_a')
    brawler_b = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='meta_matchups_as_b')
    win_rate_a = models.FloatField()  # Expected win rate of A when facing B
    date = models.DateField(auto_now_add=True)

    class Meta:
        unique_together = ('brawler_a', 'brawler_b')

    def __str__(self):
        return f"{self.brawler_a.name} vs {self.brawler_b.name} (WR A: {self.win_rate_a * 100:.1f}%)"

class MetaMapStats(models.Model):
    brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='meta_map_stats')
    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name='meta_stats')
    win_rate = models.FloatField()
    pick_rate = models.FloatField()
    category = models.CharField(max_length=20, choices=[
        ('best_pick', 'Best Pick'),
        ('winner', 'Winner'),
        ('most_used', 'Most Used'),
        ('not_recommended', 'Not Recommended'),
    ])
    trophy_range = models.CharField(max_length=10, default='1000+')
    tier = models.IntegerField(default=1)  # Map-specific is Tier 1 (Ranked) or Tier 2
    last_synced = models.DateTimeField(auto_now=True)
    date = models.DateField(auto_now_add=True)

    class Meta:
        unique_together = ['brawler', 'map', 'date', 'trophy_range']

    def __str__(self):
        return f"{self.brawler.name} on {self.map.name} (WR: {self.win_rate * 100:.1f}%, {self.trophy_range})"

