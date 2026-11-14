"""Assistant intent routing, money formatting, and OSM fallback filter parsing (offline)."""
import pytest

from app.api.assistant import answer_from_facts, detect, inr, parse_price
from app.providers.osm import filter_terms
from app.providers.http import ProviderError
from app.providers.population import parse_age_sex


def test_inr_reads_indian_style():
    assert inr(42500) == "₹42,500"
    assert inr(342000) == "₹3.42 lakh"
    assert inr(12345678) == "₹1.23 crore"
    assert inr(-95000) == "minus ₹95,000"


def test_intents():
    assert detect("what is my profit") == "profit"
    assert detect("try price 1500") == "try_price"
    assert detect("kitne competitors hai") == "competitors"
    assert detect("show me the market map") == "navigate"
    assert detect("should I open here") == "verdict"
    assert detect("what is the break even") == "breakeven"
    assert parse_price("what if I charge 2,000 rupees") == 2000
    assert parse_price("test 1.5k price") == 1500


def test_answers_only_use_facts():
    f = {"project": "Gym CP", "business_type": "Gym", "unit": "members", "market": {"competitors_found": 2, "catchment_radius_km": 1.5,
         "nearest_competitors": [{"name": "Iron House", "distance_km": 0.4}, {"name": "Fit Hub", "distance_km": 1.1}],
         "population_in_catchment": 50000, "competitor_sources": ["OpenStreetMap (via Overpass API)"]},
         "baseline": None, "decision": None}
    a = answer_from_facts("competitors", f, "competitors?")
    assert "2 competitors" in a and "Iron House" in a
    assert "simulation" in answer_from_facts("profit", f, "profit?").lower()


def test_filter_terms_for_fallbacks():
    tags, words = filter_terms(['["leisure"="fitness_centre"]', '["amenity"="gym"]', '["name"~"yoga|pilates",i]'])
    assert tags == ["leisure:fitness_centre", "amenity:gym"] and words == ["yoga", "pilates"]
    tags, _ = filter_terms(['["shop"~"^(convenience|supermarket)$"]'])
    assert tags == ["shop:convenience", "shop:supermarket"]


def test_age_sex_folds_20_classes_into_17_bands():
    # WorldPop v3 classes: 00 (under 1), 01 (1-4), 05 … 85, 90 (90 and over); given out of order on purpose
    rows = [{"class": f"{c:02d}", "age": f"age {c}", "male": 10 + c, "female": 5} for c in [90, 85, 0, 1, *range(5, 85, 5)]]
    out = parse_age_sex({"agesex_pyramid": rows})["bands"]
    assert len(out) == 17
    assert out[0] == {"age": "0 to 4", "male": 10 + 11, "female": 10}  # under 1 + 1-4
    assert out[1] == {"age": "age 5", "male": 15, "female": 5} and out[15]["age"] == "age 75"
    assert out[-1] == {"age": "80 and over", "male": 90 + 95 + 100, "female": 15}  # 80-84 + 85-89 + 90+
    assert sum(b["male"] + b["female"] for b in out) == sum(r["male"] + r["female"] for r in rows)  # nobody lost
    with pytest.raises(ProviderError):
        parse_age_sex({"agesex_pyramid": rows[:18]})


def test_strategy_intents_and_parsing():
    from app.api.assistant import detect, parse_strategy
    cur = {"marketing_spend": 20000, "quality": 0.55}
    assert detect("double the marketing") == "strategy"
    assert parse_strategy("double the marketing", cur, 125) == {"marketing_spend": 40000.0}
    assert parse_strategy("capacity 200 orders a day", cur, 125) == {"capacity_scale": 1.6}
    assert parse_strategy("open 8 am to 11 pm", cur, 125) == {"open_hour": 8.0, "close_hour": 23.0}
    assert detect("open 8 am to 11 pm") == "strategy"
    assert detect("how do agents decide whom to choose") == "explain_agents"
    assert detect("kya dikh raha hai is map me") == "screen"
    assert detect("what should i change to grow") == "insights"
    assert detect("test it") == "apply_suggestion"
    assert detect("try price 399") == "try_price"
    assert detect("kitne competitors hain?") == "competitors"


def test_insights_flag_capacity_and_awareness():
    from app.api.insights import build_insights, compare, run_view
    res = {
        "summary": {"price": 450, "units_sold": 3750, "variable_cost_per_unit": 180},
        "finance": {"operating_profit": 300000, "break_even_units": 1700},
        "monte_carlo": {"prob_loss": 0.1},
        "sensitivity": {"price_curve": [{"price": 400, "units": 3900, "profit": 280000}, {"price": 450, "units": 3750, "profit": 300000}],
                        "marketing_curve": [{"spend": 20000, "profit": 300000}, {"spend": 60000, "profit": 340000}]},
        "competitors": [{"name": "Domino's", "distance_km": 0.1, "modeled_units": 4000}],
        "abm": {"capacity_per_day": 125, "monthly_units": [3000, 3700, 3750], "monthly_finance": [{"profit": 1e5}, {"profit": 2.8e5}, {"profit": 3e5}],
                "daily": {"units_you": [125] * 30, "turned_away": [300] * 30, "demand_you": [425] * 30},
                "metrics": {"aware_final": 0.33, "trial_rate": 0.4, "repeat_share": 0.19, "afford_share": 0.52}},
    }
    out = build_insights(res, {"price": 450, "marketing_spend": 20000, "quality": 0.55}, "orders")
    keys = [i["key"] for i in out["insights"]]
    assert "capacity" in keys and "awareness" in keys and "retention" in keys
    assert out["suggested"]["changes"]
    v = run_view(res)
    better = dict(v, month3_units=4500, month3_profit=4e5)
    c = compare(v, better, "orders")
    assert c["grows"] and c["verdict"] == "better"


def test_sold_out_answers_explain_capacity():
    from app.api.assistant import compare_sentence
    from app.api.insights import compare
    v = {"month3_units": 6600, "month3_profit": 600000, "orders_per_day_last4w": 214, "turned_away_per_day_last4w": 559}
    more_ads = dict(v, month3_profit=560000, turned_away_per_day_last4w=612)
    c = compare(v, more_ads, "orders")
    assert c["verdict"] == "worse" and "already selling out" in c["spoken"] and "Add capacity" in c["spoken"]
    b = {"price": 450, "customers_or_units_per_month": 6600, "operating_profit_per_month": 624000, "demand_per_month": 7160,
         "capacity_per_month": 6600, "capacity_bound": True}
    w = dict(b, price=300, operating_profit_per_month=-366000, demand_per_month=8900)
    s = compare_sentence(b, w, "orders")
    assert "sell out your capacity" in s and "a lower price only cuts" in s
    assert "sell out" not in compare_sentence(dict(b, capacity_bound=False), dict(w, capacity_bound=False), "orders")
