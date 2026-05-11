"""
NKQM Attendance Harvester
=========================
Reads the latest attendance CSV exported from the biometric system and
upserts ALL records into the Supabase cloud database.

Run automatically (via Task Scheduler) or manually:
    python manual_harvester.py

Logs are written to: harvester.log (same folder as this script)
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
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0"
    ".Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4"
)
BATCH_SIZE      = 100   # records per API call
REQUEST_TIMEOUT = 30    # seconds

# ──────────────────────────────────────────────────────────────────────────────
# LOGGING  (file + console)
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


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────
def find_latest_csv() -> str | None:
    """Return the path of the most recently modified attendance_report CSV."""
    pattern = str(DOWNLOADS_DIR / "attendance_report_*.csv")
    files = glob.glob(pattern)
    if not files:
        log.error("No attendance CSV files found matching: %s", pattern)
        return None
    latest = max(files, key=os.path.getmtime)
    mtime  = datetime.fromtimestamp(os.path.getmtime(latest)).strftime("%Y-%m-%d %H:%M")
    log.info("Using CSV: %s  (last modified: %s)", latest, mtime)
    return latest


def fetch_student_map(headers: dict) -> dict:
    """Fetch attendance_code → student_id mapping from Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/students?select=student_id,attendance_code&limit=2000"
    try:
        r = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.RequestException as exc:
        log.error("Network error fetching students: %s", exc)
        return {}

    if r.status_code != 200:
        log.error("Failed to fetch students (%s): %s", r.status_code, r.text[:200])
        return {}

    rows = r.json()
    mapping = {
        str(s["attendance_code"]): s["student_id"]
        for s in rows
        if s.get("attendance_code")
    }
    log.info("Student map loaded: %d students", len(mapping))
    return mapping


def parse_csv(csv_path: str, student_map: dict) -> list[dict]:
    """Read the CSV and convert every row into a Supabase-ready record."""
    records     = []
    skipped     = set()

    with open(csv_path, mode="r", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            code      = str(row.get("Code", "")).strip()
            date      = str(row.get("Date", "")).strip()
            status    = str(row.get("Status", "")).strip()
            sign_in   = str(row.get("In",  "")).strip()
            sign_out  = str(row.get("Out", "")).strip()

            if not code or not date:
                continue

            if code not in student_map:
                skipped.add(code)
                continue

            records.append({
                "student_id" : student_map[code],
                "date"       : date,
                "status"     : status,
                "check_in"   : f"{date}T{sign_in}:00" if sign_in  else None,
                "check_out"  : f"{date}T{sign_out}:00" if sign_out else None,
                "updated_at" : datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            })

    if skipped:
        sample = sorted(skipped)[:15]
        log.warning(
            "%d unmatched attendance codes (not in student roster): %s%s",
            len(skipped),
            ", ".join(sample),
            " …" if len(skipped) > 15 else "",
        )

    log.info("Prepared %d records from CSV", len(records))
    return records


def upsert_records(records: list[dict], headers: dict) -> tuple[int, int]:
    """Batch-upsert records into attendance_records. Returns (success, fail)."""
    upsert_headers = {**headers, "Prefer": "resolution=merge-duplicates"}
    url            = f"{SUPABASE_URL}/rest/v1/attendance_records"
    success        = 0
    fail           = 0

    total  = len(records)
    chunks = range(0, total, BATCH_SIZE)

    for i in chunks:
        batch = records[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        try:
            res = requests.post(
                url, json=batch, headers=upsert_headers, timeout=REQUEST_TIMEOUT
            )
            if res.status_code in (200, 201):
                success += len(batch)
                done = min(i + BATCH_SIZE, total)
                log.info("  [Batch %d] %d/%d uploaded ✓", batch_num, done, total)
            else:
                fail += len(batch)
                log.error(
                    "  [Batch %d] FAILED %s — %s",
                    batch_num, res.status_code, res.text[:300],
                )
        except requests.exceptions.RequestException as exc:
            fail += len(batch)
            log.error("  [Batch %d] Network error: %s", batch_num, exc)

        time.sleep(0.3)   # polite delay

    return success, fail


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────
def run_sync():
    log.info("=" * 65)
    log.info("NKQM Attendance Harvester — %s", datetime.now().strftime("%A, %d %B %Y  %H:%M"))
    log.info("=" * 65)

    # Step 1 – find the CSV
    csv_path = find_latest_csv()
    if not csv_path:
        log.error("Sync aborted: no CSV file found.")
        return

    # Step 2 – authenticate headers
    headers = {
        "apikey"       : ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Content-Type" : "application/json",
    }

    # Step 3 – get student mapping
    student_map = fetch_student_map(headers)
    if not student_map:
        log.error("Sync aborted: could not load student roster.")
        return

    # Step 4 – parse CSV (ALL dates — upsert is idempotent)
    records = parse_csv(csv_path, student_map)
    if not records:
        log.info("No records to sync. Exiting.")
        return

    # Step 5 – upload
    success, fail = upsert_records(records, headers)

    log.info("-" * 65)
    log.info("DONE  ✓ Success: %d  |  ✗ Failed: %d  |  Total: %d",
             success, fail, success + fail)
    log.info("=" * 65)


if __name__ == "__main__":
    run_sync()
