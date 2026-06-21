from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.clubs.views import (
    ClubViewSet, ForumCategoryViewSet, ForumThreadViewSet, ForumReplyViewSet
)

router = DefaultRouter()
router.register(r'clubs', ClubViewSet, basename='club')
router.register(r'forum/categories', ForumCategoryViewSet, basename='forum-category')
router.register(r'forum/threads', ForumThreadViewSet, basename='forum-thread')
router.register(r'forum/replies', ForumReplyViewSet, basename='forum-reply')

urlpatterns = [
    path('', include(router.urls)),
]
