from django.db import models
from django.utils import timezone
from apps.core.models import Player

class Club(models.Model):
    name = models.CharField(max_length=100)
    tag = models.CharField(max_length=50, unique=True, help_text="In-game club tag, e.g., #2GGY8V9")
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.name} ({self.tag})"

class ClubMember(models.Model):
    ROLE_CHOICES = [
        ('president', 'President'),
        ('vice_president', 'Vice President'),
        ('senior', 'Senior'),
        ('member', 'Member'),
    ]
    
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name='members')
    player = models.OneToOneField(Player, on_delete=models.CASCADE, related_name='club_membership')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    is_approved = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(default=timezone.now)
    left_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.player.name} - {self.role} in {self.club.name}"

class LinkRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='link_requests')
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='club_link_requests')
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name='link_requests')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('player', 'user', 'club')

    def __str__(self):
        return f"Link {self.player.name} -> {self.user.username} in {self.club.name} [{self.status}]"

class ClubConfig(models.Model):
    club = models.OneToOneField(Club, on_delete=models.CASCADE, related_name='config')
    max_senior_pct = models.FloatField(default=25.0, help_text="Max percentage of members that can be senior (0-100)")
    weight_days = models.FloatField(default=1.0, help_text="Weight for days in club in senior score")
    weight_ranked = models.FloatField(default=1.5, help_text="Weight for ranked games played in senior score")
    weight_total = models.FloatField(default=0.5, help_text="Weight for total games played in senior score")
    linkable_roles = models.JSONField(default=list, blank=True, help_text="Roles that can request link (e.g. ['senior', 'member'])")

    def __str__(self):
        return f"Config for {self.club.name}"

class ForumCategory(models.Model):
    club = models.ForeignKey(Club, on_delete=models.CASCADE, related_name='categories', null=True, blank=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    restricted_to_seniors = models.BooleanField(default=False)
    
    def __str__(self):
        return f"{self.name} ({self.club.name if self.club else 'Global'})"

class ForumThread(models.Model):
    category = models.ForeignKey(ForumCategory, on_delete=models.CASCADE, related_name='threads')
    title = models.CharField(max_length=200)
    content = models.TextField()
    author = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='threads')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_pinned = models.BooleanField(default=False)
    likes = models.ManyToManyField(Player, related_name='liked_threads', blank=True)

    def __str__(self):
        return self.title

class ForumReply(models.Model):
    thread = models.ForeignKey(ForumThread, on_delete=models.CASCADE, related_name='replies')
    author = models.ForeignKey(Player, on_delete=models.CASCADE, related_name='replies')
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    likes = models.ManyToManyField(Player, related_name='liked_replies', blank=True)

    def __str__(self):
        return f"Reply by {self.author.name} on {self.thread.title}"
