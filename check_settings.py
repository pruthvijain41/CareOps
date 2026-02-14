
import os
import json
from supabase import create_client, Client

def check_settings():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Missing Supabase credentials")
        return

    supabase: Client = create_client(url, key)
    
    result = supabase.table("workspaces").select("*").limit(1).execute()
    if not result.data:
        print("No workspaces found")
        return

    ws = result.data[0]
    print(f"Workspace: {ws['name']} ({ws['slug']})")
    settings = ws.get('settings', {})
    print(f"Settings: {json.dumps(settings, indent=2)}")
    print(f"Timezone in settings: {settings.get('timezone')}")

if __name__ == "__main__":
    check_settings()
