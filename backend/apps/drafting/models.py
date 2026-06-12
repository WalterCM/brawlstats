from django.db import models
from apps.core.models import Player, Brawler

class Perception(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='perceptions')
    my_brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='perceptions_as_mine')
    brawler_rival = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='perceptions_as_rival')
    value = models.IntegerField()  # 1: Easy, 0: Neutral, -1: Hard, -2: Counter
    date = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('player', 'my_brawler', 'brawler_rival')

    def __str__(self):
        return f"{self.player.name}: {self.my_brawler.name} vs {self.brawler_rival.name} ({self.value})"
