"""Saves Cloudflare Radar's outage list for a local pipeline run, as the radar job in
.github/workflows/update.yml does on GitHub.

Reads CLOUDFLARE_RADAR_TOKEN from the environment or from the git-ignored .env in the
repository root (a read-only Radar token, docs/deploy.md). The token is sent only to
api.cloudflare.com and is never printed. Writes .cache/radar/outages.json, which
`python -m globe_pipeline.run` reads by default.

Usage (from the repository root): pipeline/.venv/Scripts/python pipeline/tools/fetch_radar.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))

from globe_pipeline.sources.radar import API_URL, DEFAULT_FILE  # noqa: E402

NAME = "CLOUDFLARE_RADAR_TOKEN"


def token() -> str:
    """The token from the environment, else from .env (a NAME=value line)."""
    if os.environ.get(NAME):
        return os.environ[NAME].strip()
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            key, _, value = line.partition("=")
            if key.strip() == NAME and value.strip():
                return value.strip().strip('"').strip("'")
    return ""


def main() -> int:
    secret = token()
    if not secret:
        print(f"No {NAME} in the environment or in .env.")
        return 1
    request = urllib.request.Request(
        API_URL,
        headers={"Authorization": f"Bearer {secret}", "User-Agent": "world-news-globe"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        print(f"Cloudflare Radar refused the request: HTTP {error.code}.")
        return 1
    doc = json.loads(body)
    count = len((doc.get("result") or {}).get("annotations") or [])
    DEFAULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_FILE.write_bytes(body)
    print(f"Saved {count} outages to {DEFAULT_FILE.relative_to(ROOT)}.")
    return 0 if doc.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
