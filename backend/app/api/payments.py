"""Paying for a location's report through a Razorpay payment link.

Off until RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set: without them every report stays open, as before.
With them, a project's report opens once its link is paid. The customer comes back to ``callback`` with a signature made
with our key secret over ``link id|reference id|status|payment id`` (the format of Razorpay's own SDK,
razorpay-python ``verify_payment_link_signature``), so the redirect cannot be forged.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import Project, User, utcnow
from ..security import current_user, owned_project

router = APIRouter(tags=["payments"])
RZP = "https://api.razorpay.com/v1"


def payments_on() -> bool:
    s = get_settings()
    return bool(s.razorpay_key_id and s.razorpay_key_secret)


def report_unlocked(p: Project) -> bool:
    return not payments_on() or p.is_demo or p.paid_at is not None


def require_unlocked(p: Project) -> None:
    if not report_unlocked(p):
        raise HTTPException(402, "Pay for this location's report to open it.")


def link_signature(secret: str, link_id: str, reference_id: str, status: str, payment_id: str) -> str:
    return hmac.new(secret.encode(), f"{link_id}|{reference_id}|{status}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _site() -> str:
    return get_settings().cors_origins[0].rstrip("/")  # the frontend's public address


@router.post("/projects/{project_id}/pay")
def pay(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Where to send the customer to pay, or ``unlocked`` if this project is already paid for."""
    p = owned_project(project_id, user, db)
    if report_unlocked(p):
        return {"unlocked": True}
    s = get_settings()
    auth = (s.razorpay_key_id, s.razorpay_key_secret)
    try:
        if p.payment_ref:  # a link from an earlier try: they may have paid and never been sent back here
            r = httpx.get(f"{RZP}/payment_links/{p.payment_ref.split('|')[0]}", auth=auth, timeout=20)
            old = r.json() if r.status_code == 200 else {}
            if old.get("status") == "paid":
                p.paid_at = utcnow()
                db.commit()
                return {"unlocked": True}
            if old.get("status") == "created" and old.get("short_url"):
                return {"unlocked": False, "url": old["short_url"]}
        ref = secrets.token_hex(16)
        r = httpx.post(f"{RZP}/payment_links", auth=auth, timeout=20, json={
            "amount": s.report_price_minor, "currency": s.currency_code, "reference_id": ref,
            "description": f"StrataIQ report: {p.name}"[:200], "notes": {"project_id": p.id},
            "callback_url": f"{_site()}/api/v1/payments/razorpay/callback", "callback_method": "get"})
        r.raise_for_status()
        link = r.json()
        link_id, url = link["id"], link["short_url"]
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise HTTPException(502, "The payment service did not answer. Try again in a minute.") from e
    p.payment_ref = f"{link_id}|{ref}"
    db.commit()
    return {"unlocked": False, "url": url}


@router.get("/payments/razorpay/callback")
def callback(razorpay_payment_id: str = "", razorpay_payment_link_id: str = "", razorpay_payment_link_reference_id: str = "",
             razorpay_payment_link_status: str = "", razorpay_signature: str = "", db: Session = Depends(get_db)):
    """Razorpay sends the customer's browser here after payment. Unlocks the project only if the signature is ours."""
    s = get_settings()
    p = None
    if payments_on() and razorpay_payment_link_id and razorpay_payment_link_reference_id:
        p = db.scalar(select(Project).where(Project.payment_ref == f"{razorpay_payment_link_id}|{razorpay_payment_link_reference_id}"))
    if p is None:
        return RedirectResponse(f"{_site()}/app", 303)
    expected = link_signature(s.razorpay_key_secret, razorpay_payment_link_id, razorpay_payment_link_reference_id,
                              razorpay_payment_link_status, razorpay_payment_id)
    ok = razorpay_payment_link_status == "paid" and hmac.compare_digest(expected, razorpay_signature)
    if ok and p.paid_at is None:
        p.paid_at = utcnow()
        db.commit()
    return RedirectResponse(f"{_site()}/app/projects/{p.id}/report?paid={1 if ok else 0}", 303)
