"""
NKQM Attendance Harvester (ROBUST)
==================================
Reads the latest attendance CSV and merges it with existing cloud data
to ensure no data is lost and all records follow the same schema.
"""

import csv
import glob
import logging
import os
import time
from datetime import datetime
from pathlib import Path

import requests

# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────
DOWNLOADS_DIR   = Path.home() / "Downloads"
SUPABASE_URL    = "https://wuzliodvddzmhehffqfx.supabase.co"
ANON_KEY        = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1emxpb2R2ZGR6bWhlaGZmcWZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkxNTEsImV4cCI6MjA5MjQzNTE1MX0"
    ".0ASY-NuhdHPhyg9pB2XYiXOLJTnrocXxjkC6gpqO_vQ"
)
BATCH_SIZE      = 100
REQUEST_TIMEOUT = 60

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING
# ──────────────────────────────────────────────────────────────────────────────
LOG_FILE = Path(__file__).parent / "harvester.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)

def find_latest_csv() -> str | None:
    pattern = str(DOWNLOADS_DIR / "attendance_report_*.csv")
    files = glob.glob(pattern)
    if not files:
        log.error("No CSV files found in Downloads.")
        return None
    latest = max(files, key=os.path.getmtime)
    log.info("Latest CSV: %s", latest)
    return latest

def fetch_student_map(headers: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/students?select=id,code&is_active=eq.true"
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        mapping = {str(s["code"]): s["id"] for s in r.json() if s.get("code")}
        log.info("Loaded %d students from cloud.", len(mapping))
        return mapping
    except Exception as e:
        log.error("Failed to load students: %s", e)
        return {}

def fetch_cloud_attendance(headers: dict, date_str: str) -> dict:
    """Fetch existing attendance records for a specific date to prevent overwriting with nulls."""
    url = f"{SUPABASE_URL}/rest/v1/attendance?date=eq.{date_str}&select=student_id,sign_in,sign_out,is_late"
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        # Map student_id -> record
        return {a["student_id"]: a for a in r.json()}
    except Exception as e:
        log.warn("Could not fetch existing cloud attendance: %s. Proceeding without merge.", e)
        return {}

def parse_csv(csv_path: str, student_map: dict, headers: dict) -> list[dict]:
    # We'll group records by date to fetch cloud data efficiently
    temp_records = []
    unique_dates = set()
    
    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = str(row.get("Code", "")).strip()
            date = str(row.get("Date", "")).strip()
            if not code or not date or code not in student_map: continue
            
            temp_records.append({
                "code": code,
                "student_id": student_map[code],
                "date": date,
                "in": row.get("In", "").strip() or None,
                "out": row.get("Out", "").strip() or None,
                "late": row.get("Status", "").strip().lower() == "late"
            })
            unique_dates.add(date)

    # Fetch cloud data for all relevant dates
    cloud_cache = {}
    for d in unique_dates:
        cloud_cache[d] = fetch_cloud_attendance(headers, d)

    # Merge logic
    final_records = []
    for r in temp_records:
        sid = r["student_id"]
        date = r["date"]
        cloud_rec = cloud_cache.get(date, {}).get(sid)

        # Start with a full schema (all keys present to satisfy PostgREST)
        merged = {
            "student_id": sid,
            "date": date,
            "sign_in": r["in"],
            "sign_out": r["out"],
            "is_late": r["late"]
        }

        if cloud_rec:
            # ONLY update sign_in if CSV has a value and cloud doesn't, or CSV is newer (not applicable here)
            # Actually, if cloud HAS a value and CSV has a value, we keep cloud if it looks like staggered signout?
            # Better: If CSV is empty but cloud is NOT, keep cloud!
            if not merged["sign_in"] and cloud_rec.get("sign_in"):
                merged["sign_in"] = cloud_rec["sign_in"]
            
            if not merged["sign_out"] and cloud_rec.get("sign_out"):
                merged["sign_out"] = cloud_rec["sign_out"]
            
            # Keep late status if either is late
            merged["is_late"] = merged["is_late"] or cloud_rec.get("is_late", False)

        final_records.append(merged)
        
    log.info("Processed and merged %d records.", len(final_records))
    return final_records

def sync_data():
    log.info("Starting robust sync to Attendance System...")
    csv_path = find_latest_csv()
    if not csv_path: return

    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type": "application/json"
    }

    student_map = fetch_student_map(headers)
    if not student_map: return

    records = parse_csv(csv_path, student_map, headers)
    if not records: return

    url = f"{SUPABASE_URL}/rest/v1/attendance?on_conflict=student_id,date"
    upsert_headers = {**headers, "Prefer": "resolution=merge-duplicates"}
    
    success = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i+BATCH_SIZE]
        try:
            r = requests.post(url, json=batch, headers=upsert_headers, timeout=REQUEST_TIMEOUT)
            if r.status_code in [200, 201]:
                success += len(batch)
                log.info("Synced %d/%d records...", success, len(records))
            else:
                log.error("Batch failed (%s): %s", r.status_code, r.text)
        except Exception as e:
            log.error("Request error: %s", e)
    
    log.info("Sync complete. Total success: %d", success)

if __name__ == "__main__":
    sync_data()
