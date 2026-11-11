"""Serve French Daily on localhost.

Same as `python -m http.server`, plus two fixes:
- caching is off, so after you edit a file (or pull an update) a normal reload shows it;
- .js files are always served as JavaScript (some Windows setups report text/plain,
  which makes browsers refuse to load the app's modules).

Usage: python serve.py [port]    (default 8765)
"""

import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"French Daily: http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
