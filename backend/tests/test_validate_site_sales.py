import importlib.util
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("validate_site_sales", Path(__file__).parents[1] / "scripts" / "validate_site_sales.py")
vs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vs)


def test_geocoder_rows_keep_matches_and_swap_to_lat_lng():
    text = '"7","1 Main St, Austin, TX","Match","Exact","1 MAIN ST","-97.74,30.26","1","L"\n"8","nowhere","No_Match"\n'
    assert vs.parse_geocoded(text) == {7: (30.26, -97.74)}


def test_score_uses_training_scale_and_only_held_out_rows():
    truth = np.array([100.0, 200.0, 300.0, 600.0])
    pred = np.array([1.0, 2.0, 3.0, 6.0])  # exactly 100x low
    train = np.array([True, True, False, False])
    s = vs.score(pred, truth, train)
    assert s["n"] == 2
    assert s["median_abs_pct_error"] < 1e-9
    assert s["within_1_5x"] == 1.0
    # a wrong held-out row must count, and training rows must not hide it
    bad = vs.score(np.array([1.0, 2.0, 30.0, 6.0]), truth, train)
    assert bad["within_2x"] == 0.5
