import requests
import json
import pandas as pd
from rapidfuzz import process, fuzz
import os
from datetime import datetime

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ATTENDANCE_SYSTEM_URL = os.getenv("ATTENDANCE_SYSTEM_URL")
ATTENDANCE_TOKEN = os.getenv("ATTENDANCE_TOKEN")

if not all([SUPABASE_URL, SUPABASE_KEY, ATTENDANCE_SYSTEM_URL, ATTENDANCE_TOKEN]):
    print("Error: Missing environment variables. Please set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ATTENDANCE_SYSTEM_URL, and ATTENDANCE_TOKEN.")
    exit(1)

headers_supabase = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

headers_attendance = {
    "Authorization": f"Bearer {ATTENDANCE_TOKEN}",
    "Content-Type": "application/json"
}

def get_sms_students():
    url = f"{SUPABASE_URL}/rest/v1/students?select=name,class_name,student_id,attendance_code,admission_year"
    response = requests.get(url, headers=headers_supabase)
    return response.json()

def get_attendance_students():
    # Fetch from Attendance Supabase project students table
    headers = headers_attendance.copy()
    headers["apikey"] = ATTENDANCE_TOKEN
    url = f"{ATTENDANCE_SYSTEM_URL}/rest/v1/students?select=name,code,class"
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print(f"Failed to fetch attendance students: {response.text}")
        return []
    
    # Map 'code' to 'attendance_code' for consistency in the script
    data = response.json()
    for item in data:
        item['attendance_code'] = item.get('code')
    return data

def reconcile():
    print("Starting Reconciliation...")
    sms_students = get_sms_students()
    attendance_students = get_attendance_students()
    
    if isinstance(sms_students, dict) and 'error' in sms_students:
        print(f"Error fetching SMS students: {sms_students['error']}")
        return
    if isinstance(sms_students, dict) and 'message' in sms_students:
        print(f"Error fetching SMS students: {sms_students['message']}")
        return
    if isinstance(attendance_students, dict) and 'error' in attendance_students:
        print(f"Error fetching attendance students: {attendance_students['error']}")
        return

    if not isinstance(sms_students, list) or not isinstance(attendance_students, list):
        print("Data is not in list format. SMS:", type(sms_students), "Attendance:", type(attendance_students))
        return

    if not sms_students or not attendance_students:
        print("Data missing from one or both systems. Aborting.")
        return

    sms_df = pd.DataFrame(sms_students)
    sms_df.rename(columns={'class_name': 'class'}, inplace=True) # Normalize for the script
    att_df = pd.DataFrame(attendance_students)
    
    unmatched_sms = []
    matches = []
    
    current_year = datetime.now().year

    # Fuzzy Matching
    att_names = att_df['name'].tolist()
    
    print(f"Processing {len(sms_df)} SMS records and {len(att_df)} Attendance records...")

    for idx, sms_student in sms_df.iterrows():
        name = sms_student['name']
        match = process.extractOne(name, att_names, scorer=fuzz.token_sort_ratio)
        
        if match and match[1] > 85: # 85% similarity threshold
            matched_name = match[0]
            matched_att = att_df[att_df['name'] == matched_name].iloc[0]
            matches.append({
                "sms_id": sms_student['student_id'],
                "att_code": matched_att['attendance_code'],
                "name": name,
                "admission_year": sms_student.get('admission_year') or current_year,
                "old_student_id": sms_student['student_id']
            })
            att_names.remove(matched_name)
        else:
            unmatched_sms.append(sms_student)

    remaining_att = att_df[att_df['name'].isin(att_names)]

    print(f"Matches found: {len(matches)}")
    print(f"SMS-only: {len(unmatched_sms)}")
    print(f"Attendance-only: {len(remaining_att)}")

    # 1. Handle Matched
    print("Updating matched students...")
    for match in matches:
        # OPTION: Convert matched students to new ID format?
        # Uncomment lines below to enforce new format on matched students
        # new_id = f"NKQMS-{match['admission_year']}-{match['att_code']}"
        # payload = {"attendance_code": match['att_code'], "student_id": new_id, "legacy_student_id": match['old_student_id']}
        
        payload = {"attendance_code": match['att_code']}
        url = f"{SUPABASE_URL}/rest/v1/students?student_id=eq.{match['sms_id']}"
        requests.patch(url, headers=headers_supabase, json=payload)

    # 2. Handle SMS-only (Push to Attendance System)
    print("Syncing SMS-only students to Attendance System...")
    for student in unmatched_sms:
        payload = {
            "name": student['name'],
            "class": student['class']
        }
        resp = requests.post(f"{ATTENDANCE_SYSTEM_URL}/create-student", headers=headers_attendance, json=payload)
        if resp.status_code == 200:
            att_data = resp.json()
            code = att_data['attendance_code']
            year = student.get('admission_year') or current_year
            new_id = f"NKQMS-{year}-{code}"
            
            url = f"{SUPABASE_URL}/rest/v1/students?student_id=eq.{student['student_id']}"
            requests.patch(url, headers=headers_supabase, json={
                "attendance_code": code,
                "student_id": new_id,
                "legacy_student_id": student['student_id'],
                "is_active": True
            })

    # 3. Handle Attendance-only (Pull into SMS)
    print("Importing Attendance-only students to SMS...")
    for _, student in remaining_att.iterrows():
        year = current_year
        code = student['attendance_code']
        new_id = f"NKQMS-{year}-{code}"
        payload = {
            "name": student['name'],
            "class": student.get('class', 'Unknown'),
            "attendance_code": code,
            "student_id": new_id,
            "is_active": True,
            "admission_year": year
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/students", headers=headers_supabase, json=payload)

    # Export unmatched to CSV for review
    if unmatched_sms:
        pd.DataFrame(unmatched_sms).to_csv("unmatched_sms_review.csv", index=False)
    if not remaining_att.empty:
        remaining_att.to_csv("unmatched_attendance_review.csv", index=False)
        
    print("Reconciliation complete. Check .csv files for any students that require manual intervention.")

if __name__ == "__main__":
    reconcile()

