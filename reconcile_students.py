import requests
import json
import pandas as pd
from rapidfuzz import process, fuzz
import os

# Configuration (Use environment variables or replace with actual values)
SUPABASE_URL = os.getenv("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "YOUR_SERVICE_ROLE_KEY")
ATTENDANCE_SYSTEM_URL = os.getenv("ATTENDANCE_SYSTEM_URL", "YOUR_ATTENDANCE_SYSTEM_URL")
ATTENDANCE_TOKEN = os.getenv("ATTENDANCE_TOKEN", "YOUR_ATTENDANCE_TOKEN")

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
    url = f"{SUPABASE_URL}/rest/v1/students?select=id,name,class,student_id,attendance_code,admission_year"
    response = requests.get(url, headers=headers_supabase)
    return response.json()

def get_attendance_students():
    # Assuming an endpoint that lists all students in the attendance system
    url = f"{ATTENDANCE_SYSTEM_URL}/list-students"
    response = requests.get(url, headers=headers_attendance)
    return response.json()

def reconcile():
    print("Fetching data...")
    sms_students = get_sms_students()
    attendance_students = get_attendance_students()
    
    sms_df = pd.DataFrame(sms_students)
    att_df = pd.DataFrame(attendance_students)
    
    unmatched_sms = []
    unmatched_att = []
    matches = []

    print(f"SMS Students: {len(sms_df)}")
    print(f"Attendance Students: {len(att_df)}")

    # Fuzzy Matching
    att_names = att_df['name'].tolist()
    
    for idx, sms_student in sms_df.iterrows():
        name = sms_student['name']
        match = process.extractOne(name, att_names, scorer=fuzz.token_sort_ratio)
        
        if match and match[1] > 85: # Threshold for match
            matched_att = att_df[att_df['name'] == match[0]].iloc[0]
            matches.append({
                "sms_id": sms_student['id'],
                "att_code": matched_att['attendance_code'],
                "name": name
            })
            # Remove from att_names so it's not matched again
            att_names.remove(match[0])
        else:
            unmatched_sms.append(sms_student)

    # Remaining in att_names are attendance-only
    remaining_att = att_df[att_df['name'].isin(att_names)]

    print(f"Matches found: {len(matches)}")
    print(f"SMS-only: {len(unmatched_sms)}")
    print(f"Attendance-only: {len(remaining_att)}")

    # 1. Handle Matched
    for match in matches:
        # Update SMS with attendance_code
        url = f"{SUPABASE_URL}/rest/v1/students?id=eq.{match['sms_id']}"
        requests.patch(url, headers=headers_supabase, json={"attendance_code": match['att_code']})

    # 2. Handle SMS-only (Create in Attendance System)
    for student in unmatched_sms:
        payload = {
            "name": student['name'],
            "class": student['class']
        }
        resp = requests.post(f"{ATTENDANCE_SYSTEM_URL}/create-student", headers=headers_attendance, json=payload)
        if resp.status_code == 200:
            att_data = resp.json()
            code = att_data['attendance_code']
            new_id = f"NKQMS-{student['admission_year']}-{code}"
            
            url = f"{SUPABASE_URL}/rest/v1/students?id=eq.{student['id']}"
            requests.patch(url, headers=headers_supabase, json={
                "attendance_code": code,
                "student_id": new_id,
                "legacy_student_id": student['student_id']
            })

    # 3. Handle Attendance-only (Create in SMS)
    for _, student in remaining_att.iterrows():
        year = 2024 # Or default
        new_id = f"NKQMS-{year}-{student['attendance_code']}"
        payload = {
            "name": student['name'],
            "class": student.get('class', 'Unknown'),
            "attendance_code": student['attendance_code'],
            "student_id": new_id,
            "is_active": True,
            "admission_year": year
        }
        requests.post(f"{SUPABASE_URL}/rest/v1/students", headers=headers_supabase, json=payload)

    # Export unmatched to CSV
    pd.DataFrame(unmatched_sms).to_csv("unmatched_sms.csv", index=False)
    pd.DataFrame(remaining_att).to_csv("unmatched_attendance.csv", index=False)
    print("Reconciliation complete. CSVs generated for manual review.")

if __name__ == "__main__":
    reconcile()
