from ascendant.bridge import fit


def test_exact_quadratic_is_recovered_and_labs_offset():
    pairs = [(f"m{i}", "a", float(x), 0.5 * x + 0.004 * x * x) for i, x in enumerate(range(5, 60, 5))]
    b = fit(pairs, 2.0)
    assert b.rmse < 1e-6 and b.n == len(pairs)
    assert abs(b.predict("a", 40) - (20 + 6.4)) < 1e-6
    assert abs(b.predict("unseen", 40) - b.predict("a", 40)) < 1e-9


def test_lab_offset_is_shrunk_and_scores_floor_at_zero():
    pairs = [(f"x{i}", "a", float(10 + 4 * i), float(10 + 4 * i)) for i in range(10)]
    pairs += [("y0", "b", 30.0, 26.0)]
    one = fit(pairs, 2.0)
    assert -0.15 < one.offsets["b"] < 0.0
    assert 26.0 < one.predict("b", 30.0) < 30.0
    assert fit([(f"z{i}", "a", float(i), 0.0) for i in range(5)], 2.0).predict("a", 1.0) >= 0.0


def test_fit_is_order_independent():
    pairs = [(f"m{i}", "ab"[i % 2], 5.0 + 3 * i, 4.0 + 2.5 * i + (i % 3)) for i in range(12)]
    assert fit(pairs, 2.0) == fit(pairs[::-1], 2.0)


def test_lab_offset_is_relative_and_cannot_reorder_low_scores():
    # Lab "up" sits 4 points above the map at 40-60; lab "down" 2 points below.
    pairs = [(f"u{i}", "up", float(x), 0.8 * x + 4.0) for i, x in enumerate(range(40, 65, 5))]
    pairs += [(f"d{i}", "down", float(x), 0.8 * x - 2.0) for i, x in enumerate(range(42, 67, 5))]
    pairs += [(f"n{i}", "none", float(x), 0.8 * x) for i, x in enumerate(range(5, 70, 5))]
    b = fit(pairs, 2.0)
    assert b.offsets["up"] > 0 > b.offsets["down"]
    # An older "down" model that scored clearly higher on the old scale stays ahead.
    assert b.predict("down", 12.0) > b.predict("up", 9.0)
    # The correction shrinks with the score instead of staying a fixed number of points.
    assert abs(b.predict("up", 10.0) - b.predict("none", 10.0)) < abs(
        b.predict("up", 60.0) - b.predict("none", 60.0))
