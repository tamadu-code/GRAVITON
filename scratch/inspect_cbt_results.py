import urllib.request
import json

url = 'https://urqygjltionvaxuacfzr.supabase.co/rest/v1/cbt_results?limit=1'
headers = {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycXlnamx0aW9udmF4dWFjZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMzEzMDEsImV4cCI6MjA5MjYwNzMwMX0.Vpk7rifsfjMCVBSYpEdVzkHv3w324iKp8B7urlKc_e4'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        data = json.loads(html)
        print('Row fetched:', data)
        if data:
            print('Columns list:', list(data[0].keys()))
        else:
            print('Empty data array.')
except Exception as e:
    print('Failed to request:', e)
