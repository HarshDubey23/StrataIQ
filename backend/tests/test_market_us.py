import json
import os
import subprocess
import sys

from app.api import quickstart as qs
from app.api.quickstart import parse_idea


def test_every_category_and_model_has_us_starter_figures():
    assert set(qs.TYPICAL_PRICE_US) == set(qs.TYPICAL_PRICE_IN)
    assert set(qs.ARCH_PRICE_US) == set(qs.ARCH_PRICE_IN)
    assert set(qs.ARCH_COSTS_US) == set(qs.ARCH_COSTS_IN)
    for arch, costs in qs.ARCH_COSTS_US.items():
        assert set(costs) == set(qs.ARCH_COSTS_IN[arch])
        assert all(v > 0 for v in costs.values())


def test_parse_idea_reads_dollars_cents_and_budgets():
    p = parse_idea("A café in South Austin, Texas, coffee at $6.50 a cup, budget $200k")
    assert p["place"] == "South Austin, Texas"
    assert p["price"] == 6.5
    assert p["budget"] == 200_000
    assert "6.50" not in p["business"]


def test_parse_idea_still_reads_rupees():
    p = parse_idea("I want to open a cafe in Indiranagar, Bengaluru with price 250 and budget 20 lakh")
    assert p["price"] == 250 and p["budget"] == 2_000_000


def test_us_market_switches_units_scale_search_and_demo():
    # Settings are read at import time, so check a real US process.
    code = """
import json
from app.config import get_settings
from app.factors.registry import BY_KEY
from app.categories.archetypes import ARCHETYPES
from app.engine.genome import VALUE_OF_TIME, REG
from app.api.assistant import inr
from app.api.demo import DEFAULT_SPOT, LIVE_KINDS
from app.api.quickstart import ARCH_COSTS
print(json.dumps({
    "search": get_settings().search_countries,
    "rent_unit": BY_KEY["fin_rent"].unit if "fin_rent" in BY_KEY else next(x.unit for k, x in BY_KEY.items() if k.endswith("_rent")),
    "rupee_units": sum("₹" in x.unit for x in BY_KEY.values()) + sum("₹" in (p.unit + p.label) for p in REG),
    "half_saturation": ARCHETYPES["membership"].params["marketing_half_saturation"].value,
    "vot": VALUE_OF_TIME, "money": inr(342000), "spot": DEFAULT_SPOT, "gym": LIVE_KINDS["gym"]["base"]["price"],
    "rent": ARCH_COSTS["dine_in"]["rent"],
}))
"""
    env = {**os.environ, "MARKET": "US", "PYTHONIOENCODING": "utf-8"}
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, encoding="utf-8", env=env, check=True).stdout
    r = json.loads(out.strip().splitlines()[-1])
    assert r["search"] == "us"
    assert r["rent_unit"] == "$/month"
    assert r["rupee_units"] == 0
    assert r["half_saturation"] == 2500
    assert r["vot"] == [8.0, 100.0]
    assert r["money"] == "$342,000"
    assert r["spot"] == "austin"
    assert r["gym"] == 49
    assert r["rent"] == 7000
