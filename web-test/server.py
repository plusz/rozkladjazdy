#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"
HOST = "127.0.0.1"
PORT = 5173


def read_env_file(path: Path) -> dict:
    values = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        values[key] = value

    return values


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_um_request(self, endpoint: str, params: dict):
        query = urlencode(params)
        url = f"https://api.um.warszawa.pl/api/action/{endpoint}/?{query}"
        request = Request(url, headers={"User-Agent": "web-test-proxy"})

        try:
            with urlopen(request, timeout=20) as response:
                body = response.read()
                self.send_response(response.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            self.send_json(
                {
                    "error": "Upstream API error",
                    "status": error.code,
                    "message": message,
                },
                status=502,
            )
        except URLError as error:
            self.send_json(
                {
                    "error": "Cannot reach upstream API",
                    "message": str(error),
                },
                status=502,
            )

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/config.json":
            env = read_env_file(ENV_PATH)
            self.send_json(
                {
                    "hasOpenDataKey": bool(env.get("OPENDATA_UM_KEY")),
                }
            )
            return

        if path in ("/api/schedule", "/api/live"):
            env = read_env_file(ENV_PATH)
            api_key = env.get("OPENDATA_UM_KEY")

            if not api_key:
                self.send_json({"error": "Missing OPENDATA_UM_KEY in .env"}, status=500)
                return

            line = (query.get("line", [""])[0] or "221").strip()
            stop_id = (query.get("stopId", [""])[0] or "6089").strip()
            stop_nr = (query.get("stopNr", [""])[0] or "03").strip()

            if path == "/api/schedule":
                params = {
                    "id": "e923fa0e-d96c-43f9-ae6e-60518c9f3238",
                    "busstopId": stop_id,
                    "busstopNr": stop_nr,
                    "line": line,
                    "apikey": api_key,
                }
                self.proxy_um_request("dbtimetable_get", params)
            else:
                params = {
                    "resource_id": "f2e5503e-927d-4ad3-9500-4ab9e55deb59",
                    "line": line,
                    "type": "1",
                    "apikey": api_key,
                }
                self.proxy_um_request("busestrams_get", params)
            return

        return super().do_GET()


def main():
    os.chdir(ROOT_DIR)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Serving {ROOT_DIR} on http://{HOST}:{PORT}")
    print("Config endpoint: /config.json")
    print("Proxy endpoints: /api/schedule, /api/live")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
