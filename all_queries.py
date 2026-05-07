"""
All six Stage 2 queries on the Eurovision tweets collection.

Each query is implemented as a function returning a list of plain-Python dicts
(JSON-serializable), so the Flask app can hand them straight to the browser.
"""

from __future__ import annotations

import os
import time
from typing import Any, Iterable

from pymongo import MongoClient

try:
    import certifi
    _CA_FILE = certifi.where()
except Exception:
    _CA_FILE = None

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "eurovision"
COLL_NAME = "tweets"

_client: MongoClient | None = None


def coll():
    global _client
    if _client is None:
        kwargs = {}
        # Atlas (mongodb+srv://) needs TLS with a known CA bundle. certifi works
        # everywhere; passing tlsCAFile makes pymongo use it instead of the
        # OS trust store, which avoids TLSV1 handshake errors in slim containers.
        if MONGO_URI.startswith("mongodb+srv://") or "tls=true" in MONGO_URI:
            if _CA_FILE:
                kwargs["tlsCAFile"] = _CA_FILE
        _client = MongoClient(MONGO_URI, **kwargs)
    return _client[DB_NAME][COLL_NAME]


def _ser(v: Any) -> Any:
    """Make values JSON-friendly (datetimes -> iso strings, ObjectId -> str, etc.)."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, dict):
        return {k: _ser(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_ser(x) for x in v]
    # datetime, ObjectId, etc.
    return str(v)


# ============================================================
# Q1 — Path finding: thread of tweets posted by a target user
# ============================================================
def q1_user_thread(screen_name: str = "blcklcfr") -> dict:
    """
    Reconstruct local reply chains within a single user's tweets.

    Strategy (per Stage 2 PDF):
      1. fetch all tweets by user, chronological
      2. build a tweet_id -> tweet hashmap
      3. find roots — either no reply-to OR the parent is not authored by this user
      4. DFS each root, output the chain with linkage info
    """
    t0 = time.time()
    cursor = coll().find(
        {"user.screen_name": screen_name},
        {
            "_id": 1, "created_at": 1, "text": 1, "tweet_type": 1,
            "user.name": 1, "user.screen_name": 1,
            "reply.in_reply_to_status_id": 1,
            "reply.in_reply_to_screen_name": 1,
        },
    ).sort("created_at", 1)
    tweets = list(cursor)

    by_id = {t["_id"]: t for t in tweets}
    children: dict[int, list[int]] = {tid: [] for tid in by_id}
    roots: list[int] = []
    for t in tweets:
        parent = (t.get("reply") or {}).get("in_reply_to_status_id")
        if parent in by_id:
            children[parent].append(t["_id"])
        else:
            roots.append(t["_id"])

    threads = []
    for root_id in roots:
        chain = []
        stack = [(root_id, 0)]
        while stack:
            tid, depth = stack.pop()
            t = by_id[tid]
            chain.append({
                "depth": depth,
                "id": tid,
                "created_at": _ser(t.get("created_at")),
                "tweet_type": t.get("tweet_type"),
                "in_reply_to_id": (t.get("reply") or {}).get("in_reply_to_status_id"),
                "in_reply_to_screen_name": (t.get("reply") or {}).get("in_reply_to_screen_name"),
                "user_name": t.get("user", {}).get("name"),
                "user_screen_name": t.get("user", {}).get("screen_name"),
                "text": t.get("text"),
            })
            # push children in reverse so earliest comes off the stack first
            kids = sorted(children.get(tid, []), reverse=True)
            for k in kids:
                stack.append((k, depth + 1))
        threads.append(chain)

    return {
        "screen_name": screen_name,
        "total_tweets": len(tweets),
        "thread_count": len(threads),
        "threads": threads,
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# Q2 — Country with most tweets
# ============================================================
def q2_top_country(limit: int = 10) -> dict:
    t0 = time.time()
    pipeline = [
        {"$match": {"place.country": {"$ne": None}}},
        {"$group": {"_id": "$place.country", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ]
    rows = list(coll().aggregate(pipeline, allowDiskUse=True))
    return {
        "winner": rows[0] if rows else None,
        "top": [{"country": r["_id"], "tweet_count": r["tweet_count"]} for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# Q3 — User with most tweets
# ============================================================
def q3_top_user(limit: int = 10) -> dict:
    t0 = time.time()
    pipeline = [
        {"$group": {
            "_id": "$user.id",
            "name": {"$first": "$user.name"},
            "screen_name": {"$first": "$user.screen_name"},
            "verified": {"$first": "$user.verified"},
            "tweet_count": {"$sum": 1},
        }},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ]
    rows = list(coll().aggregate(pipeline, allowDiskUse=True))
    return {
        "winner": _ser(rows[0]) if rows else None,
        "top": [_ser(r) for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# Q4 — Top 100 hashtags
# ============================================================
def q4_top_hashtags(limit: int = 100) -> dict:
    t0 = time.time()
    pipeline = [
        {"$match": {"entities.hashtags": {"$exists": True, "$ne": []}}},
        {"$unwind": "$entities.hashtags"},
        {"$group": {"_id": "$entities.hashtags", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ]
    rows = list(coll().aggregate(pipeline, allowDiskUse=True))
    return {
        "top": [{"hashtag": r["_id"], "tweet_count": r["tweet_count"]} for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# Q5 — Mutual-reply trios
# ============================================================
def q5_mutual_trios(limit: int = 25) -> dict:
    """
    Find trios A, B, C where each pair has replied to each other.

    Strategy:
      1. Pull all (replier_user, replied_to_user) pairs from reply tweets via aggregation.
      2. In Python, build the set of directed edges, derive the mutual (undirected) graph.
      3. Enumerate triangles in the mutual graph.
      4. Re-fetch user names for the trios in the result.
    """
    t0 = time.time()
    pipeline = [
        {"$match": {
            "tweet_type": "reply",
            "user.id": {"$ne": None},
            "reply.in_reply_to_user_id": {"$ne": None},
            "$expr": {"$ne": ["$user.id", "$reply.in_reply_to_user_id"]},
        }},
        {"$group": {
            "_id": {"a": "$user.id", "b": "$reply.in_reply_to_user_id"},
        }},
    ]
    edges_directed: set[tuple[int, int]] = set()
    for row in coll().aggregate(pipeline, allowDiskUse=True):
        a, b = row["_id"]["a"], row["_id"]["b"]
        edges_directed.add((a, b))

    # mutual edges only — store as adjacency of sorted (smaller, larger)
    adj: dict[int, set[int]] = {}
    mutual_pairs = 0
    for a, b in edges_directed:
        if (b, a) in edges_directed and a != b:
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
            if a < b:
                mutual_pairs += 1

    # enumerate triangles: for each node u, for each neighbor v > u, intersect neighbor sets for w > v
    trios: list[tuple[int, int, int]] = []
    nodes = sorted(adj.keys())
    for u in nodes:
        nu = adj[u]
        higher_u = [v for v in nu if v > u]
        for v in higher_u:
            nv = adj[v]
            common = nu & nv
            for w in common:
                if w > v:
                    trios.append((u, v, w))
                    if len(trios) >= 1000:
                        break
            if len(trios) >= 1000:
                break
        if len(trios) >= 1000:
            break

    # resolve user_id -> screen_name/name for the trios we'll show
    show = trios[:limit]
    needed_ids = {x for trio in show for x in trio}
    name_map: dict[int, dict[str, Any]] = {}
    if needed_ids:
        cursor = coll().aggregate([
            {"$match": {"user.id": {"$in": list(needed_ids)}}},
            {"$group": {"_id": "$user.id",
                        "name": {"$first": "$user.name"},
                        "screen_name": {"$first": "$user.screen_name"}}},
        ])
        for r in cursor:
            name_map[r["_id"]] = {"name": r.get("name"), "screen_name": r.get("screen_name")}

    formatted = []
    for trio in show:
        formatted.append([
            {"user_id": uid, **name_map.get(uid, {"name": None, "screen_name": None})}
            for uid in trio
        ])

    return {
        "directed_edges": len(edges_directed),
        "mutual_pairs": mutual_pairs,
        "trio_count_total": len(trios),
        "trios": formatted,
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# Q6 — For each verified user, percentage of tweet types
# ============================================================
def q6_verified_user_breakdown(limit: int = 25) -> dict:
    t0 = time.time()
    pipeline = [
        {"$match": {"user.verified": True}},
        {"$group": {
            "_id": {"user_id": "$user.id", "tweet_type": "$tweet_type"},
            "count": {"$sum": 1},
        }},
        {"$group": {
            "_id": "$_id.user_id",
            "by_type": {"$push": {"tweet_type": "$_id.tweet_type", "count": "$count"}},
            "total": {"$sum": "$count"},
        }},
        {"$sort": {"total": -1}},
        {"$limit": limit},
        {"$lookup": {
            "from": "tweets",
            "let": {"uid": "$_id"},
            "pipeline": [
                {"$match": {"$expr": {"$eq": ["$user.id", "$$uid"]}}},
                {"$limit": 1},
                {"$project": {"name": "$user.name", "screen_name": "$user.screen_name", "_id": 0}},
            ],
            "as": "user_info",
        }},
    ]
    rows = list(coll().aggregate(pipeline, allowDiskUse=True))

    output = []
    for r in rows:
        info = r.get("user_info", [{}])[0] if r.get("user_info") else {}
        total = r["total"]
        by_type = {x["tweet_type"]: x["count"] for x in r["by_type"]}
        for t in ("simple", "reply", "retweet", "quote"):
            by_type.setdefault(t, 0)
        pct = {t: round(by_type[t] / total * 100, 2) for t in by_type}
        output.append({
            "user_id": r["_id"],
            "name": info.get("name"),
            "screen_name": info.get("screen_name"),
            "total": total,
            "counts": by_type,
            "percent": pct,
        })

    return {
        "rows": output,
        "elapsed_s": round(time.time() - t0, 3),
    }


# ============================================================
# CLI entry point — quick smoke test of all six
# ============================================================
if __name__ == "__main__":
    import json
    print("Q2:", json.dumps(q2_top_country(limit=5), indent=2, default=str))
    print("Q3:", json.dumps(q3_top_user(limit=5), indent=2, default=str))
    print("Q4 (first 5):", json.dumps({"top": q4_top_hashtags(limit=5)["top"]}, indent=2))
    print("Q1 (blcklcfr):", json.dumps(q1_user_thread("blcklcfr"), indent=2, default=str))
    print("Q6 (first 3):", json.dumps({"rows": q6_verified_user_breakdown(limit=3)["rows"]}, indent=2, default=str))
    print("Q5 (running, may take ~30s)...")
    print("Q5:", json.dumps({k: v for k, v in q5_mutual_trios(limit=5).items() if k != "trios"}, indent=2))
