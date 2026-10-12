"""Artificial Analysis free API client (attribution required: https://artificialanalysis.ai)."""

from __future__ import annotations

import os
import sys

import httpx

from ascendant.paths import ROOT

API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models"
USER_AGENT = "AscendantAnalysis/0.1 (+https://github.com/; deterministic lab health index)"


def load_api_key() -> str:
    key = os.environ.get("AA_API_KEY")
    if key:
        return key
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "AA_API_KEY" and value.strip():
                return value.strip().strip('"').strip("'")
    if sys.platform == "win32":  # set via setx/SetEnvironmentVariable but not yet inherited
        import winreg

        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
                return str(winreg.QueryValueEx(k, "AA_API_KEY")[0])
        except OSError:
            pass
    raise RuntimeError("AA_API_KEY not found in environment or .env")


def fetch_models(client: httpx.Client) -> bytes:
    resp = client.get(API_URL, headers={"x-api-key": load_api_key()})
    resp.raise_for_status()
    return resp.content
