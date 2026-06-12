from rest_framework import permissions

class IsSupabaseAuthenticated(permissions.BasePermission):
    """
    Allows access only to requests that have been authenticated via Supabase.
    """
    def has_permission(self, request, view):
        return bool(request.player is not None)
