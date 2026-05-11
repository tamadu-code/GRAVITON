import csv
import requests
import json
import time
from datetime import datetime

# CONFIGURATION
CSV_PATH = r"C:\Users\ELECTRO-TECH\Downloads\attendance_report_2026-05-11.csv"
SUPABASE_URL = "https://urqygjltionvaxuacfzr.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4"

def manual_sync():
    print(f"Starting Manual Sync from {CSV_PATH}")
    
    # 1. Fetch Student Map (attendance_code -> student_id)
    print("Fetching student mapping from cloud...")
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type": "application/json"
    }
    
    r = requests.get(f"{SUPABASE_URL}/rest/v1/students?select=student_id,attendance_code", headers=headers)
    if r.status_code != 200:
        print(f"Failed to fetch students: {r.text}")
        return
    
    students = r.json()
    student_map = {str(s['attendance_code']): s['student_id'] for s in students if s['attendance_code']}
    print(f"Mapped {len(student_map)} students.")

    # 2. Read CSV
    print("Reading local CSV...")
    records_to_sync = []
    with open(CSV_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date = row['Date']
            if "2026-05-04" <= date <= "2026-05-08":
                code = row['Code']
                if code in student_map:
                    records_to_sync.append({
                        "student_id": student_map[code],
                        "date": date,
                        "status": row['Status'],
                        "check_in": f"{date}T{row['In']}:00Z" if row['In'] else None,
                        "check_out": f"{date}T{row['Out']}:00Z" if row['Out'] else None,
                        "updated_at": datetime.utcnow().isoformat() + "Z"
                    })

    print(f"Found {len(records_to_sync)} valid records for May 4-8.")

    # 3. Upload to attendance_records
    success = 0
    fail = 0
    
    # Batch size of 50 for stability
    for i in range(0, len(records_to_sync), 50):
        batch = records_to_sync[i:i+50]
        # Using Upsert via PostgREST
        # Note: on_conflict requires columns that have a unique constraint.
        # student_id, date is the unique constraint.
        upsert_headers = {
            **headers,
            "Prefer": "resolution=merge-duplicates"
        }
        
        try:
            res = requests.post(f"{SUPABASE_URL}/rest/v1/attendance_records", json=batch, headers=upsert_headers)
            if res.status_code in [200, 201]:
                success += len(batch)
                print(f"Synced {success}/{len(records_to_sync)}...")
            else:
                fail += len(batch)
                print(f"Batch failed: {res.status_code} - {res.text}")
        except Exception as e:
            fail += len(batch)
            print(f"Request error: {e}")
        
        time.sleep(0.5) # Slight delay to be nice to the API

    print(f"\n--- SYNC COMPLETE ---")
    print(f"Total Success: {success}")
    print(f"Total Failed: {fail}")

if __name__ == "__main__":
    manual_sync()
