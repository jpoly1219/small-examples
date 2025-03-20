import zlib

with open("stream157.raw", "rb") as f:
    compressed_data = f.read()

try:
    decompressed = zlib.decompress(compressed_data)
    print(decompressed.decode("utf-8", errors="ignore"))
except zlib.error:
    print("Not zlib-compressed. Trying raw output...")
    print(compressed_data.decode("utf-8", errors="ignore"))
