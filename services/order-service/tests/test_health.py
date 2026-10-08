import sys
sys.path.insert(0, ".")
from app import app
def test_health():
    c=app.test_client()
    r=c.get("/health")
    assert r.status_code == 200
    assert r.get_json()["status"] == "UP"
