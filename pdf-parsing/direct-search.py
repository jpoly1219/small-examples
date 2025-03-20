import re

with open("stream157.raw", "rb") as f:
    raw_data = f.read().decode('latin-1', errors='ignore')

# Find text inside Tj or TJ commands
matches = re.findall(r'\((.*?)\)\s*Tj', raw_data) + \
    re.findall(r'\[(.*?)\]\s*TJ', raw_data)
extracted_text = ' '.join(matches)

print(extracted_text)
