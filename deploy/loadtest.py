"""Many visitors at once against a running site. Standard library only, so it runs anywhere.

    python3 deploy/loadtest.py https://your.domain --visitors 100

Rate limits count per client, so one machine may see 429s. The report counts those apart from real failures.
"""
import argparse
import concurrent.futures as cf
import statistics
import time
import urllib.error
import urllib.request


def get(url: str, timeout: float = 120.0) -> tuple[int, float]:
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            r.read()
            return r.status, time.perf_counter() - start
    except urllib.error.HTTPError as e:
        return e.code, time.perf_counter() - start
    except Exception:  # timeouts and dropped connections count as failures
        return 0, time.perf_counter() - start


def summarise(results: list[tuple[int, float]]) -> dict:
    ok = sorted(t for s, t in results if 200 <= s < 400)
    return {"requests": len(results), "ok": len(ok), "limited": sum(s == 429 for s, _ in results),
            "failed": sum(s == 0 or s >= 500 for s, _ in results),
            "p50_s": round(statistics.median(ok), 2) if ok else None, "p95_s": round(ok[int(0.95 * (len(ok) - 1))], 2) if ok else None}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("base")
    p.add_argument("--visitors", type=int, default=100)
    p.add_argument("--rounds", type=int, default=5)
    a = p.parse_args()
    base = a.base.rstrip("/")
    pages = [f"{base}/", f"{base}/methodology", f"{base}/api/health"]
    urls = pages * (a.visitors * a.rounds // len(pages))
    with cf.ThreadPoolExecutor(a.visitors) as pool:
        print("browsing", summarise(list(pool.map(get, urls))))


if __name__ == "__main__":
    main()
