"""The six Stage 2 queries on the tweets collection."""

import os
import time

from pymongo import MongoClient

try:
    import certifi
    _CA = certifi.where()
except ImportError:
    _CA = None

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "eurovision"
COLL_NAME = "tweets"

_client = None


def coll():
    global _client
    if _client is None:
        kw = {}
        # Atlas needs an explicit CA bundle when running in slim containers
        if _CA and (MONGO_URI.startswith("mongodb+srv://") or "tls=true" in MONGO_URI):
            kw["tlsCAFile"] = _CA
        _client = MongoClient(MONGO_URI, **kw)
    return _client[DB_NAME][COLL_NAME]


def jsonify_value(v):
    """Make BSON values JSON-serializable (datetime/ObjectId/etc -> str)."""
    if v is None or isinstance(v, (str, int, float, bool)):
        return v
    if isinstance(v, dict):
        return {k: jsonify_value(x) for k, x in v.items()}
    if isinstance(v, list):
        return [jsonify_value(x) for x in v]
    return str(v)


def q1_user_thread(screen_name="blcklcfr"):
    """Reconstruct the reply chains in a single user's tweets."""
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
    children = {tid: [] for tid in by_id}
    roots = []
    for t in tweets:
        parent = (t.get("reply") or {}).get("in_reply_to_status_id")
        if parent in by_id:
            children[parent].append(t["_id"])
        else:
            roots.append(t["_id"])

    threads = []
    for root in roots:
        chain = []
        stack = [(root, 0)]
        while stack:
            tid, depth = stack.pop()
            t = by_id[tid]
            chain.append({
                "depth": depth,
                "id": tid,
                "created_at": jsonify_value(t.get("created_at")),
                "tweet_type": t.get("tweet_type"),
                "in_reply_to_id": (t.get("reply") or {}).get("in_reply_to_status_id"),
                "in_reply_to_screen_name": (t.get("reply") or {}).get("in_reply_to_screen_name"),
                "user_name": t.get("user", {}).get("name"),
                "user_screen_name": t.get("user", {}).get("screen_name"),
                "text": t.get("text"),
            })
            for kid in sorted(children.get(tid, []), reverse=True):
                stack.append((kid, depth + 1))
        threads.append(chain)

    return {
        "screen_name": screen_name,
        "total_tweets": len(tweets),
        "thread_count": len(threads),
        "threads": threads,
        "elapsed_s": round(time.time() - t0, 3),
    }


def q2_top_country(limit=10):
    t0 = time.time()
    rows = list(coll().aggregate([
        {"$match": {"place.country": {"$ne": None}}},
        {"$group": {"_id": "$place.country", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ], allowDiskUse=True))
    return {
        "winner": rows[0] if rows else None,
        "top": [{"country": r["_id"], "tweet_count": r["tweet_count"]} for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


def q3_top_user(limit=10):
    t0 = time.time()
    rows = list(coll().aggregate([
        {"$group": {
            "_id": "$user.id",
            "name": {"$first": "$user.name"},
            "screen_name": {"$first": "$user.screen_name"},
            "verified": {"$first": "$user.verified"},
            "tweet_count": {"$sum": 1},
        }},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ], allowDiskUse=True))
    return {
        "winner": jsonify_value(rows[0]) if rows else None,
        "top": [jsonify_value(r) for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


def q4_top_hashtags(limit=100):
    t0 = time.time()
    rows = list(coll().aggregate([
        {"$match": {"entities.hashtags": {"$exists": True, "$ne": []}}},
        {"$unwind": "$entities.hashtags"},
        {"$group": {"_id": "$entities.hashtags", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
        {"$limit": limit},
    ], allowDiskUse=True))
    return {
        "top": [{"hashtag": r["_id"], "tweet_count": r["tweet_count"]} for r in rows],
        "elapsed_s": round(time.time() - t0, 3),
    }


def q5_mutual_trios(limit=25):
    """Triangles in the undirected mutual-reply graph."""
    t0 = time.time()

    # 1. directed (replier, replied_to) pairs
    edges = set()
    for row in coll().aggregate([
        {"$match": {
            "tweet_type": "reply",
            "user.id": {"$ne": None},
            "reply.in_reply_to_user_id": {"$ne": None},
            "$expr": {"$ne": ["$user.id", "$reply.in_reply_to_user_id"]},
        }},
        {"$group": {"_id": {"a": "$user.id", "b": "$reply.in_reply_to_user_id"}}},
    ], allowDiskUse=True):
        edges.add((row["_id"]["a"], row["_id"]["b"]))

    # 2. keep only edges that go both ways
    adj = {}
    mutual_pairs = 0
    for a, b in edges:
        if (b, a) in edges and a != b:
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
            if a < b:
                mutual_pairs += 1

    # 3. enumerate triangles, capping at 1000 so we don't blow up if the graph is huge
    trios = []
    for u in sorted(adj):
        nu = adj[u]
        for v in (x for x in nu if x > u):
            for w in nu & adj[v]:
                if w > v:
                    trios.append((u, v, w))
                    if len(trios) >= 1000:
                        break
            if len(trios) >= 1000:
                break
        if len(trios) >= 1000:
            break

    # 4. attach screen names for the trios we'll display
    show = trios[:limit]
    ids = {x for trio in show for x in trio}
    names = {}
    if ids:
        for r in coll().aggregate([
            {"$match": {"user.id": {"$in": list(ids)}}},
            {"$group": {"_id": "$user.id",
                        "name": {"$first": "$user.name"},
                        "screen_name": {"$first": "$user.screen_name"}}},
        ]):
            names[r["_id"]] = {"name": r.get("name"), "screen_name": r.get("screen_name")}

    formatted = []
    for trio in show:
        formatted.append([
            {"user_id": uid, **names.get(uid, {"name": None, "screen_name": None})}
            for uid in trio
        ])

    return {
        "directed_edges": len(edges),
        "mutual_pairs": mutual_pairs,
        "trio_count_total": len(trios),
        "trios": formatted,
        "elapsed_s": round(time.time() - t0, 3),
    }


def q6_verified_user_breakdown(limit=25):
    """Per-verified-user split across simple/reply/retweet/quote."""
    t0 = time.time()
    rows = list(coll().aggregate([
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
    ], allowDiskUse=True))

    out = []
    for r in rows:
        info = r["user_info"][0] if r.get("user_info") else {}
        total = r["total"]
        counts = {x["tweet_type"]: x["count"] for x in r["by_type"]}
        for tt in ("simple", "reply", "retweet", "quote"):
            counts.setdefault(tt, 0)
        pct = {tt: round(counts[tt] / total * 100, 2) for tt in counts}
        out.append({
            "user_id": r["_id"],
            "name": info.get("name"),
            "screen_name": info.get("screen_name"),
            "total": total,
            "counts": counts,
            "percent": pct,
        })

    return {"rows": out, "elapsed_s": round(time.time() - t0, 3)}


if __name__ == "__main__":
    import json
    print("Q2:", json.dumps(q2_top_country(5), indent=2, default=str))
    print("Q3:", json.dumps(q3_top_user(5), indent=2, default=str))
    print("Q4:", json.dumps(q4_top_hashtags(5)["top"], indent=2))
    print("Q1:", json.dumps(q1_user_thread("blcklcfr"), indent=2, default=str))
    print("Q6:", json.dumps(q6_verified_user_breakdown(3)["rows"], indent=2, default=str))
    summary = {k: v for k, v in q5_mutual_trios(5).items() if k != "trios"}
    print("Q5:", json.dumps(summary, indent=2))
