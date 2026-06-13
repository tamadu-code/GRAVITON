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

def authenticate() -> tuple[dict, str | None]:
    """
    Tries to log in using device credentials to obtain a JWT.
    Returns (headers, tenant_id).
    """
    import json
    config = {}
    config_path = Path(__file__).parent / "harvester_config.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            log.info("Loaded config from harvester_config.json")
        except Exception as e:
            log.error("Failed to read harvester_config.json: %s", e)

    url = config.get("SUPABASE_URL") or os.environ.get("SUPABASE_URL") or SUPABASE_URL
    anon_key = config.get("ANON_KEY") or os.environ.get("ANON_KEY") or ANON_KEY
    email = config.get("DEVICE_EMAIL") or os.environ.get("DEVICE_EMAIL") or os.environ.get("HARVESTER_EMAIL")
    password = config.get("DEVICE_PASSWORD") or os.environ.get("DEVICE_PASSWORD") or os.environ.get("HARVESTER_PASSWORD")

    headers = {
        "apikey": anon_key,
        "Content-Type": "application/json"
    }

    tenant_id = None
    if email and password:
        log.info("Attempting login as device profile: %s", email)
        login_url = f"{url}/auth/v1/token?grant_type=password"
        try:
            payload = {"email": email, "password": password}
            r = requests.post(login_url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            data = r.json()
            access_token = data.get("access_token")
            if access_token:
                log.info("Login successful. Using authenticated session.")
                headers["Authorization"] = f"Bearer {access_token}"
                
                # Fetch tenant_id from user's profile
                profile_url = f"{url}/rest/v1/profiles?select=tenant_id"
                pr = requests.get(profile_url, headers=headers, timeout=REQUEST_TIMEOUT)
                pr.raise_for_status()
                profiles = pr.json()
                if profiles:
                    tenant_id = profiles[0].get("tenant_id")
                    log.info("Device associated with tenant_id: %s", tenant_id)
            else:
                log.error("Login response missing access_token.")
        except Exception as e:
            log.error("Authentication failed: %s. Falling back to legacy anonymous mode.", e)
    
    if not headers.get("Authorization"):
        log.warning("No device credentials configured or login failed. Running in LEGACY ANONYMOUS mode.")
        headers["Authorization"] = f"Bearer {anon_key}"
        # Seed tenant ID for fallback/legacy mode
        tenant_id = "00000000-0000-0000-0000-000000000001"

    return headers, tenant_id

def fetch_student_map(headers: dict, url_base: str) -> dict:
    url = f"{url_base}/rest/v1/students?select=id,code&is_active=eq.true"
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        mapping = {str(s["code"]): s["id"] for s in r.json() if s.get("code")}
        log.info("Loaded %d students from cloud.", len(mapping))
        return mapping
    except Exception as e:
        log.error("Failed to load students: %s", e)
        return {}

def fetch_cloud_attendance(headers: dict, url_base: str, date_str: str) -> dict:
    """Fetch existing attendance records for a specific date to prevent overwriting with nulls."""
    url = f"{url_base}/rest/v1/attendance?date=eq.{date_str}&select=student_id,sign_in,sign_out,is_late"
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        r.raise_for_status()
        # Map student_id -> record
        return {a["student_id"]: a for a in r.json()}
    except Exception as e:
        log.warn("Could not fetch existing cloud attendance: %s. Proceeding without merge.", e)
        return {}

def parse_csv(csv_path: str, student_map: dict, headers: dict, url_base: str, tenant_id: str | None) -> list[dict]:
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
        cloud_cache[d] = fetch_cloud_attendance(headers, url_base, d)

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
        
        if tenant_id:
            merged["tenant_id"] = tenant_id

        if cloud_rec:
            # ONLY update sign_in if CSV has a value and cloud doesn't, or CSV is newer
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

    # Authenticate and get headers and tenant_id
    headers, tenant_id = authenticate()
    
    # Resolve SUPABASE_URL dynamically from config/env if set
    import json
    config = {}
    config_path = Path(__file__).parent / "harvester_config.json"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception:
            pass
    url_base = config.get("SUPABASE_URL") or os.environ.get("SUPABASE_URL") or SUPABASE_URL

    student_map = fetch_student_map(headers, url_base)
    if not student_map: return

    records = parse_csv(csv_path, student_map, headers, url_base, tenant_id)
    if not records: return

    url = f"{url_base}/rest/v1/attendance?on_conflict=student_id,date"
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
