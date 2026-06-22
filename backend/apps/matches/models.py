from django.db import models
from apps.core.models import Player, Brawler, Map

class Match(models.Model):
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='matches')
    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name='matches')
    my_brawler = models.ForeignKey(Brawler, on_delete=models.SET_NULL, related_name='matches_played', null=True, blank=True)
    mode = models.CharField(max_length=100)
    result = models.CharField(max_length=20)
    draft_type = models.CharField(max_length=20, default='normal')
    date = models.DateTimeField(auto_now_add=True)
    api_match_id = models.CharField(max_length=100, null=True, blank=True)
    series_api_match_id = models.CharField(max_length=100, null=True, blank=True)
    my_brawler_trophies = models.IntegerField(null=True, blank=True)
    is_star_player = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['player', 'result']),
            models.Index(fields=['player', 'mode']),
            models.Index(fields=['player', 'my_brawler']),
        ]

    def __str__(self):
        return f"Match {self.id} - {self.player.name} as {self.my_brawler.name if self.my_brawler else 'Unknown'} ({self.result})"

class DraftEvent(models.Model):
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name='draft_events')
    type = models.CharField(max_length=10)  # 'ban' or 'pick'
    brawler = models.ForeignKey(Brawler, on_delete=models.CASCADE, related_name='draft_events')
    team = models.CharField(max_length=10)  # 'allied' or 'enemy'
    order = models.IntegerField()  # 1-indexed selection/ban sequence order

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.match.id} - Order {self.order}: {self.type.upper()} {self.brawler.name} ({self.team})"
