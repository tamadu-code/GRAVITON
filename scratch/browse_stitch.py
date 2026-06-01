import os
import subprocess

paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
]

browser_path = None
for p in paths:
    if os.path.exists(p):
        browser_path = p
        break

if not browser_path:
    print("Error: No browser found at standard paths.")
    exit(1)

print("Found browser:", browser_path)
cmd = [
    browser_path,
    "--headless",
    "--disable-gpu",
    "--dump-dom",
    "https://stitch.withgoogle.com/projects/711628386848638409"
]

out_file = r"c:\Users\ELECTRO-TECH\OneDrive\Desktop\SMS\scratch\rendered_stitch.html"
print("Running command and saving to:", out_file)

with open(out_file, 'w', encoding='utf-8') as f:
    result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True)
    if result.returncode == 0:
        print("Success! DOM dumped to file.")
    else:
        print("Error: Command returned exit code", result.returncode)
        print("Stderr:", result.stderr)
