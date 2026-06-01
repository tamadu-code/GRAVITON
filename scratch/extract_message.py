with open(r"c:\Users\ELECTRO-TECH\OneDrive\Desktop\SMS\scratch\rendered_stitch.html", 'r', encoding='utf-8') as f:
    html = f.read()

print("HTML length:", len(html))

# Let's search for "Subject Performance Analysis" or other text
search_terms = ["Subject Performance Analysis", "Score Insight", "Subject Analysis", "MATH-12C", "At-Risk", "Elena Rodriguez"]
for term in search_terms:
    pos = html.lower().find(term.lower())
    if pos != -1:
        print(f"Found '{term}' at index {pos}")
        print("Context:", repr(html[pos-100:pos+300]))
    else:
        print(f"Could not find '{term}'")
