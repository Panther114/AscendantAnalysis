from __future__ import annotations

from dataclasses import dataclass
from functools import cache
from typing import Any

import yaml

from ascendant.paths import CONFIG


def _load(name: str) -> dict[str, Any]:
    return yaml.safe_load((CONFIG / name).read_text(encoding="utf-8")) or {}


@dataclass(frozen=True)
class Config:
    methodology: dict[str, Any]
    labs: dict[str, Any]
    overrides: dict[str, Any]
    perception: dict[str, Any]

    @property
    def version(self) -> str:
        return str(self.methodology["version"])

    def m(self, section: str) -> dict[str, Any]:
        return self.methodology[section]


@cache
def load() -> Config:
    return Config(
        methodology=_load("methodology.v1.yaml"),
        labs=_load("labs.yaml"),
        overrides=_load("overrides.yaml"),
        perception=_load("perception.yaml"),
    )
