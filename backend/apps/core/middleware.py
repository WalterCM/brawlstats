from django.utils.deprecation import MiddlewareMixin
from apps.core.models import Player

class SupabaseAuthMiddleware(MiddlewareMixin):
    """
    Middleware that reads the Supabase User ID (and optional name) from the headers
    and attaches the corresponding Player instance to the request as request.player.
    """
    def process_request(self, request):
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
