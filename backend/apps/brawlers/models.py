from django.db import models
from apps.core.models import Brawler, Map

class MetaBrawlerStats(models.Model):
    brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='meta_stats')
    win_rate = models.FloatField()
    pick_rate = models.FloatField()
    date = models.DateField(auto_now_add=True)

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
    date = models.DateField(auto_now_add=True)

    class Meta:
        unique_together = ('brawler', 'map')

    def __str__(self):
        return f"{self.brawler.name} on {self.map.name} (WR: {self.win_rate * 100:.1f}%)"
