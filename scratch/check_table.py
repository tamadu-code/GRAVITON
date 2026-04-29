import requests
import os

url = "https://urqygjltionvaxuacfzr.supabase.co/rest/v1/attendance_records?select=*&limit=1"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzAzMTMwMSwiZXhwIjoyMDkyNjA3MzAxfQ.BqWkPly4jgGFD4eWmzvLTkq4ywXL41LyI9jZHF51Quc",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzAzMTMwMSwiZXhwIjoyMDkyNjA3MzAxfQ.BqWkPly4jgGFD4eWmzvLTkq4ywXL41LyI9jZHF51Quc"
}

try:
    r = requests.get(url, headers=headers)
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text}")
except Exception as e:
    print(f"Error: {e}")
