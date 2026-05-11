"""
NKQM Attendance Harvester (FINAL)
=================================
Reads the latest attendance CSV and upserts records into the cloud.
Optimized to avoid overwriting existing cloud sign-out times with nulls.
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
SUPABASE_URL    = "https://urqygjltionvaxuacfzr.supabase.co"
ANON_KEY        = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0"
    ".Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4"
)
BATCH_SIZE      = 100
REQUEST_TIMEOUT = 30

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
        rows = r.json()
        mapping = {str(s["code"]): s["id"] for s in rows if s.get("code")}
        log.info("Loaded %d students from cloud.", len(mapping))
        return mapping
    except Exception as e:
        log.error("Failed to load students: %s", e)
        return {}

def parse_csv(csv_path: str, student_map: dict) -> list[dict]:
    records = []
    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = str(row.get("Code", "")).strip()
            date = str(row.get("Date", "")).strip()
            status = str(row.get("Status", "")).strip()
            
            if not code or not date or code not in student_map:
                continue

            # Core record
            rec = {
                "student_id": student_map[code],
                "date": date,
                "is_late": status.lower() == "late"
            }
            
            # Only add sign_in/out if they have values in the CSV.
            # This prevents overwriting cloud-calculated sign-outs with nulls.
            in_val = row.get("In", "").strip()
            if in_val: rec["sign_in"] = in_val
            
            out_val = row.get("Out", "").strip()
            if out_val: rec["sign_out"] = out_val

            records.append(rec)
            
    log.info("Parsed %d records from CSV.", len(records))
    return records

def sync_data():
    log.info("Starting sync to Attendance System...")
    csv_path = find_latest_csv()
    if not csv_path: return

    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type": "application/json"
    }

    student_map = fetch_student_map(headers)
    if not student_map: return

    records = parse_csv(csv_path, student_map)
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
