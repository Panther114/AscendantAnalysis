from conftest import D, release, universe

from ascendant.export import _release_index
from ascendant.scoring import Engine


def test_release_index_includes_releases_before_the_replay(cfg):
    old = release("old", "alpha", D(2022, 1, 1), "Alpha", [(20, 1)], 1)
    recent = release("recent", "alpha", D(2026, 1, 1), "Alpha", [(30, 1)], 1)
    engine = Engine(universe([old, recent], D(2026, 2, 1)), cfg)

    index = _release_index(engine)

    assert set(index) == {"old", "recent"}
    assert index["old"]["date"] == "2022-01-01"
