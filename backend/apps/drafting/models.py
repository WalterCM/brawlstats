from django.db import models
from apps.core.models import Player, Brawler
from apps.matches.models import Match

class Perception(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='perceptions')
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='perceptions')
    my_brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='perceptions_as_mine')
    brawler_rival = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='perceptions_as_rival')
    value = models.IntegerField()  # 1: Easy, 0: Neutral, -1: Hard, -2: Counter
    date = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('match', 'brawler_rival')

    def __str__(self):
        return f"{self.player.name} in Match {self.match.id}: {self.my_brawler.name} vs {self.brawler_rival.name} ({self.value})"
