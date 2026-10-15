import hashlib
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from share import server


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = patch.object(server, "DATA", Path(self.temp.name))
        self.data.start()
        server.PEERS.clear()
        server.UPLOADS.clear()
        server.ATTEMPTS.clear()
        self.client = TestClient(server.app)
        self.client.__enter__()
        self.a = self.pair("Mac")
        self.b = self.pair("Windows")
        self.c = self.pair("Phone")

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.data.stop()
        self.temp.cleanup()

    def pair(self, name):
        response = self.client.post("/api/pair", json={"code": server.invite()["code"], "name": name})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def headers(self, device):
        return {"Authorization": "Bearer " + device["token"]}

    def create(self, **extra):
        value = {"id": str(uuid.uuid4()), "recipient": self.b["id"], "kind": "file", "name": "test.txt", "size": 5, **extra}
        response = self.client.post("/api/items", json=value, headers=self.headers(self.a))
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_pair_code_is_single_use_and_expiring(self):
        code = server.invite()["code"]
        first = self.client.post("/api/pair", json={"code": code, "name": "New"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.client.post("/api/pair", json={"code": code, "name": "Other"}).status_code, 401)
        with server.db() as c:
            c.execute("UPDATE invites SET expires=0")
        self.assertEqual(self.client.post("/api/pair", json={"code": "0000", "name": "Other"}).status_code, 401)
        self.assertEqual(self.client.get("/api/items").status_code, 401)

    def test_file_round_trip_and_recipient_isolation(self):
        record = self.create()
        path = f'/api/items/{record["id"]}/file'
        self.assertEqual(self.client.put(path, content=b"hello", headers=self.headers(self.b)).status_code, 403)
        result = self.client.put(path, content=b"hello", headers=self.headers(self.a))
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["digest"], hashlib.sha256(b"hello").hexdigest())
        self.assertEqual(self.client.get(path, headers=self.headers(self.b)).content, b"hello")
        self.assertEqual(self.client.get(path, headers=self.headers(self.c)).status_code, 404)
        self.assertEqual(self.client.get("/api/items", headers=self.headers(self.c)).json()["items"], [])
        self.assertEqual(self.client.delete(f'/api/items/{record["id"]}', headers=self.headers(self.c)).status_code, 404)

    def test_incomplete_upload_removed_and_can_retry(self):
        record = self.create()
        path = f'/api/items/{record["id"]}/file'
        self.assertEqual(self.client.put(path, content=b"bad", headers=self.headers(self.a)).status_code, 400)
        self.assertFalse((server.DATA / record["id"]).exists())
        self.assertEqual(self.client.get(path, headers=self.headers(self.b)).status_code, 404)
        self.assertEqual(self.client.put(path, content=b"hello", headers=self.headers(self.a)).status_code, 200)
        # A retry after the success response was lost must not overwrite a completed file.
        self.assertEqual(self.client.put(path, content=b"other", headers=self.headers(self.a)).status_code, 200)
        self.assertEqual(self.client.get(path, headers=self.headers(self.b)).content, b"hello")

    def test_size_storage_and_download_budget(self):
        with patch.object(server, "STORAGE_LIMIT", 3):
            response = self.client.post("/api/items", json={"id": str(uuid.uuid4()), "recipient": self.b["id"], "kind": "file", "size": 5}, headers=self.headers(self.a))
            self.assertEqual(response.status_code, 507)
        record = self.create()
        path = f'/api/items/{record["id"]}/file'
        self.assertEqual(self.client.put(path, content=b"toolong", headers=self.headers(self.a)).status_code, 413)
        self.client.put(path, content=b"hello", headers=self.headers(self.a))
        with patch.object(server, "EGRESS_LIMIT", 5):
            self.assertEqual(self.client.get(path, headers=self.headers(self.b)).status_code, 200)
            self.assertEqual(self.client.get(path, headers=self.headers(self.b)).status_code, 429)

    def test_text_expiry_and_safe_filenames(self):
        record = self.create(kind="text", text="private", name="../../note")
        self.assertEqual(record["name"], "note")
        self.assertEqual(record["size"], 7)
        with server.db() as c:
            c.execute("UPDATE items SET expires=?", (time.time() - 1,))
        server.cleanup()
        self.assertEqual(self.client.get("/api/items", headers=self.headers(self.b)).json()["items"], [])

    def test_revocation(self):
        headers = self.headers(self.a)
        self.assertEqual(self.client.delete("/api/device", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/devices", headers=headers).status_code, 401)

    def test_authenticated_signal_and_online_status(self):
        origin = {"Origin": "https://share.reverieach.com"}
        with self.client.websocket_connect("/ws", headers=origin) as a:
            a.send_json({"token": self.a["token"]})
            self.assertEqual(a.receive_json()["type"], "ready")
            with self.client.websocket_connect("/ws", headers=origin) as b:
                b.send_json({"token": self.b["token"]})
                self.assertEqual(b.receive_json()["type"], "ready")
                a.send_json({"type": "offer", "to": self.b["id"], "session": "test", "sdp": "v=0"})
                self.assertEqual(b.receive_json()["from"], self.a["id"])
                devices = self.client.get("/api/devices", headers=self.headers(self.a)).json()["devices"]
                self.assertTrue(next(d for d in devices if d["id"] == self.b["id"])["online"])
        devices = self.client.get("/api/devices", headers=self.headers(self.a)).json()["devices"]
        self.assertFalse(any(d["online"] for d in devices))

    def test_page_security_and_local_api_absent(self):
        response = self.client.get("/")
        self.assertIn("frame-ancestors", response.headers["content-security-policy"])
        self.assertIn("Quick Text", response.text)
        for path in ("/api/config/load", "/api/mail/summary", "/docs"):
            self.assertEqual(self.client.get(path).status_code, 404)


if __name__ == "__main__":
    unittest.main()
