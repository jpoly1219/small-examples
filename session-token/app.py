import requests

# Create a session to persist cookies
session = requests.Session()

# First request to get the HttpOnly cookie
response = session.post('http://localhost:8080/auth/v1/login', json={
    "username": "user1",
    "password": "password"
}, headers={
    "Content-Type": "application/json"
})
print("Cookies after login:", session.cookies.get("aceai-session-token"))
st = session.cookies.get("aceai-session-token")

# Subsequent request with the cookie automatically sent
bad_token = "badtoken"
response = session.get('http://localhost:8080/synthetic/v1/getUploadURL', headers={
    # "Authentication": f"Bearer {st}"
    "Authentication": f"Bearer {bad_token}"
})
print(response.text)
