from django.contrib import admin
from apps.brawlers.models import MetaBrawlerStats, MetaMapStats

@admin.register(MetaBrawlerStats)
class MetaBrawlerStatsAdmin(admin.ModelAdmin):
    list_display = ['brawler', 'win_rate', 'pick_rate', 'date', 'tier']
    list_filter = ['date', 'tier']
    search_fields = ['brawler__name']

@admin.register(MetaMapStats)
class MetaMapStatsAdmin(admin.ModelAdmin):
    list_display = ['brawler', 'map', 'win_rate', 'pick_rate', 'category', 'trophy_range', 'date']
    list_filter = ['date', 'category', 'trophy_range']
    search_fields = ['brawler__name', 'map__name']
