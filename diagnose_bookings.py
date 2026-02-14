
import os
import json
from datetime import datetime, timezone
from supabase import create_client, Client

def diagnose():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        print("Missing Supabase credentials")
        return

    supabase: Client = create_client(url, key)
    
    now = datetime.now(timezone.utc)
    print(f"Server Current Time (UTC): {now.isoformat()}")
    
    # Just get the last few bookings to see the data
    result = supabase.table("bookings").select("*").order("starts_at", desc=True).limit(10).execute()
    print("\nRecent Bookings:")
    for b in result.data:
        print(f"ID: {b['id']}, Status: {b['status']}, Starts: {b['starts_at']}, Ends: {b['ends_at']}")
        
    # Check if any should have been updated
    pending_past = [b for b in result.data if b['status'] in ('pending', 'confirmed') and b['ends_at'] < now.isoformat()]
    print(f"\nPending/Confirmed past bookings found: {len(pending_past)}")
    for b in pending_past:
        print(f"  -> {b['id']} (Ends: {b['ends_at']})")

if __name__ == "__main__":
    diagnose()
