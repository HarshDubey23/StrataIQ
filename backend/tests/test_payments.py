"""Report payments: the signature format, the lock, the pay route and the callback (Razorpay and the database are stubbed)."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import payments as pay


class Db:
    def __init__(self, project=None):
        self.project, self.commits = project, 0

    def commit(self):
        self.commits += 1

    def scalar(self, _query):
        return self.project


def project(**kw):
    return SimpleNamespace(**{"id": "p1", "name": "Cafe, Civil Lines", "is_demo": False, "paid_at": None, "payment_ref": None, **kw})


@pytest.fixture
def keys(monkeypatch):
    s = SimpleNamespace(razorpay_key_id="rzp_test_x", razorpay_key_secret="s3cret", report_price_minor=99900, currency_code="INR",
                        cors_origins=["https://india.example.com/"])
    monkeypatch.setattr(pay, "get_settings", lambda: s)
    return s


def test_signature_is_razorpays_payment_link_format():
    # HMAC-SHA256, hex, over "link id|reference id|status|payment id" with the key secret (razorpay-python verify_payment_link_signature)
    sig = pay.link_signature("s3cret", "plink_1", "ref9", "paid", "pay_7")
    assert sig == "8c0cee0cea82889cef45da50dd833a7c51c7fe070257021815faf4ccb5cdedff"
    assert sig != pay.link_signature("other", "plink_1", "ref9", "paid", "pay_7")
    assert sig != pay.link_signature("s3cret", "plink_1", "ref9", "created", "pay_7")
    assert sig != pay.link_signature("s3cret", "plink_1|ref9", "", "paid", "pay_7")


def test_reports_stay_open_until_keys_are_set(monkeypatch):
    monkeypatch.setattr(pay, "get_settings", lambda: SimpleNamespace(razorpay_key_id="", razorpay_key_secret=""))
    assert pay.report_unlocked(project()) is True
    pay.require_unlocked(project())  # no error


def test_lock_opens_for_paid_and_demo_projects_only(keys):
    assert pay.report_unlocked(project()) is False
    assert pay.report_unlocked(project(paid_at="2026-11-14")) is True
    assert pay.report_unlocked(project(is_demo=True)) is True
    with pytest.raises(HTTPException) as e:
        pay.require_unlocked(project())
    assert e.value.status_code == 402


def test_pay_creates_a_link_for_the_right_amount_and_remembers_it(keys, monkeypatch):
    p, sent = project(), {}
    monkeypatch.setattr(pay, "owned_project", lambda *_: p)

    def post(url, auth, timeout, json):
        sent.update(url=url, auth=auth, json=json)
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"id": "plink_1", "short_url": "https://rzp.io/i/abc"})

    monkeypatch.setattr(pay.httpx, "post", post)
    db = Db()
    out = pay.pay("p1", user=None, db=db)
    assert out == {"unlocked": False, "url": "https://rzp.io/i/abc"}
    j = sent["json"]
    assert sent["url"].endswith("/payment_links") and sent["auth"] == ("rzp_test_x", "s3cret")
    assert (j["amount"], j["currency"], j["callback_method"]) == (99900, "INR", "get")
    assert j["callback_url"] == "https://india.example.com/api/v1/payments/razorpay/callback"
    assert p.payment_ref == f"plink_1|{j['reference_id']}" and len(j["reference_id"]) == 32 and db.commits == 1
    assert p.paid_at is None  # creating a link pays for nothing


def test_pay_unlocks_when_an_earlier_link_was_paid_and_reuses_an_open_one(keys, monkeypatch):
    p = project(payment_ref="plink_1|ref9")
    monkeypatch.setattr(pay, "owned_project", lambda *_: p)
    monkeypatch.setattr(pay.httpx, "post", lambda *a, **k: pytest.fail("must not create a second link"))
    status = {"v": "created"}
    monkeypatch.setattr(pay.httpx, "get", lambda url, auth, timeout: SimpleNamespace(
        status_code=200, json=lambda: {"status": status["v"], "short_url": "https://rzp.io/i/abc"}))
    assert pay.pay("p1", user=None, db=Db()) == {"unlocked": False, "url": "https://rzp.io/i/abc"} and p.paid_at is None
    status["v"] = "paid"
    db = Db()
    assert pay.pay("p1", user=None, db=db) == {"unlocked": True} and p.paid_at is not None and db.commits == 1


def test_pay_reports_a_payment_service_failure(keys, monkeypatch):
    monkeypatch.setattr(pay, "owned_project", lambda *_: project())

    def boom(*a, **k):
        raise pay.httpx.ConnectError("down")

    monkeypatch.setattr(pay.httpx, "post", boom)
    with pytest.raises(HTTPException) as e:
        pay.pay("p1", user=None, db=Db())
    assert e.value.status_code == 502


def _callback(p, *, status="paid", sig=None, link="plink_1", ref="ref9", payment="pay_7"):
    db = Db(p)
    good = pay.link_signature("s3cret", link, ref, status, payment)
    r = pay.callback(razorpay_payment_id=payment, razorpay_payment_link_id=link, razorpay_payment_link_reference_id=ref,
                     razorpay_payment_link_status=status, razorpay_signature=good if sig is None else sig, db=db)
    return r, db


def test_callback_unlocks_only_with_our_signature_and_paid_status(keys):
    p = project(payment_ref="plink_1|ref9")
    r, db = _callback(p, sig="0" * 64)  # forged
    assert p.paid_at is None and db.commits == 0 and r.headers["location"].endswith("/app/projects/p1/report?paid=0")
    r, db = _callback(p, status="created")  # correctly signed, but not paid
    assert p.paid_at is None and r.headers["location"].endswith("paid=0")
    r, db = _callback(p)
    assert p.paid_at is not None and db.commits == 1 and r.status_code == 303
    assert r.headers["location"] == "https://india.example.com/app/projects/p1/report?paid=1"
    first = p.paid_at
    _callback(p)  # the customer reloads the callback page
    assert p.paid_at is first


def test_callback_for_an_unknown_link_goes_home_without_touching_anything(keys):
    r, db = _callback(None)
    assert r.headers["location"] == "https://india.example.com/app" and db.commits == 0
