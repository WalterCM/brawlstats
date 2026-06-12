from django.utils.deprecation import MiddlewareMixin
from rest_framework.authtoken.models import Token
from apps.core.models import Player

class SupabaseAuthMiddleware(MiddlewareMixin):
    """
    Middleware that reads the Django Token from the Authorization header or
    falls back to the legacy X-Supabase headers, attaching the corresponding Player
    instance to the request as request.player.
    """
    def process_request(self, request):
        # 1. Try to resolve via Django Auth Token
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if auth_header and auth_header.startswith('Token '):
            token_key = auth_header.split(' ')[1]
            try:
                token = Token.objects.select_related('user').get(key=token_key)
                request.user = token.user
                
                # Fetch or create the Player record representing this Django user
                player, created = Player.objects.get_or_create(
                    supabase_auth_id=f"django-user-{token.user.id}",
                    defaults={'name': token.user.username}
                )
                
                request.player = player
                return
            except Exception:
                # Catch DoesNotExist or unmigrated DB states during startup
                pass

        # 2. Fallback to legacy custom headers (e.g. for testing)
        supabase_uid = request.META.get('HTTP_X_SUPABASE_USER_ID')
        supabase_name = request.META.get('HTTP_X_SUPABASE_USER_NAME', 'Brawler')

        if supabase_uid:
            player, created = Player.objects.get_or_create(
                supabase_auth_id=supabase_uid,
                defaults={'name': supabase_name}
            )
            # Update name if it changed
            if not created and player.name != supabase_name and supabase_name != 'Brawler':
                player.name = supabase_name
                player.save()
            
            request.player = player
        else:
            request.player = None
