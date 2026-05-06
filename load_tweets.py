"""
Stream both Eurovision NDJSON files into MongoDB with the full Stage 2 schema.

Schema per tweet (only fields the 6 queries need):
  { _id: <tweet id, int>,
    created_at: <datetime>,
    text: <str, truncated to 320 chars>,
    tweet_type: "simple" | "reply" | "retweet" | "quote",
    user: { id, name, screen_name, verified },
    reply: { in_reply_to_status_id, in_reply_to_user_id, in_reply_to_screen_name } | absent,
    retweeted_status_id: <int> | absent,
    quoted_status_id:    <int> | absent,
    entities: { hashtags: [<lowercased>...] } | absent,
    place:    { country, full_name, country_code } | absent }

Skips non-tweet lines (e.g. {"limit": ...} stream control records).
Uses unordered upserts so reruns are idempotent.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from pymongo import MongoClient, UpdateOne
from pymongo.errors import BulkWriteError

DATA_DIR = Path(r"C:\Users\adame\cs498\data")
FILES = ["Eurovision.json", "Eurovision2.json"]
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "eurovision"
COLL_NAME = "tweets"
BATCH_SIZE = 5000
TEXT_MAX = 320  # tweets cap at 280; 320 is generous
TWITTER_TS_FMT = "%a %b %d %H:%M:%S %z %Y"


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, TWITTER_TS_FMT).astimezone(timezone.utc)
    except Exception:
        return None


def transform(raw: dict):
    """Return trimmed doc, or None if this line isn't a tweet."""
    tid = raw.get("id")
    if tid is None:
        return None  # likely {"limit": ...} or {"delete": ...}

    # tweet type
    in_reply_to_status_id = raw.get("in_reply_to_status_id")
    rt = raw.get("retweeted_status")
    qt = raw.get("quoted_status")
    if rt:
        ttype = "retweet"
    elif qt:
        ttype = "quote"
    elif in_reply_to_status_id is not None:
        ttype = "reply"
    else:
        ttype = "simple"

    doc = {
        "_id": tid,
        "created_at": parse_dt(raw.get("created_at")),
        "text": (raw.get("text") or "")[:TEXT_MAX],
        "tweet_type": ttype,
    }

    # user
    u = raw.get("user") or {}
    doc["user"] = {
        "id": u.get("id"),
        "name": u.get("name"),
        "screen_name": u.get("screen_name"),
        "verified": bool(u.get("verified", False)),
    }

    # reply
    if in_reply_to_status_id is not None or raw.get("in_reply_to_user_id") is not None:
        doc["reply"] = {
            "in_reply_to_status_id": in_reply_to_status_id,
            "in_reply_to_user_id": raw.get("in_reply_to_user_id"),
            "in_reply_to_screen_name": raw.get("in_reply_to_screen_name"),
        }

    if rt and rt.get("id") is not None:
        doc["retweeted_status_id"] = rt["id"]
    if qt and qt.get("id") is not None:
        doc["quoted_status_id"] = qt["id"]

    # hashtags (lowercased)
    entities = raw.get("entities") or {}
    hashtags = entities.get("hashtags") or []
    norm = [h["text"].lower() for h in hashtags if isinstance(h, dict) and h.get("text")]
    if norm:
        doc["entities"] = {"hashtags": norm}

    # place
    place = raw.get("place")
    if isinstance(place, dict) and place.get("country"):
        doc["place"] = {
            "country": place.get("country"),
            "full_name": place.get("full_name"),
            "country_code": place.get("country_code"),
        }

    return doc


def flush(coll, ops):
    if not ops:
        return
    try:
        coll.bulk_write(ops, ordered=False)
    except BulkWriteError as e:
        n_dup = sum(1 for w in e.details.get("writeErrors", []) if w.get("code") == 11000)
        n_other = len(e.details.get("writeErrors", [])) - n_dup
        if n_other:
            print(f"  bulk: {n_dup} dup, {n_other} other errors", file=sys.stderr)


def create_indexes(coll):
    print("\nCreating indexes...")
    t0 = time.time()
    coll.create_index([("user.screen_name", 1), ("created_at", 1)])
    coll.create_index([("reply.in_reply_to_status_id", 1)])
    coll.create_index([("user.id", 1), ("created_at", 1)])
    coll.create_index([("place.country", 1)])
    coll.create_index([("entities.hashtags", 1)])  # multikey
    coll.create_index([("user.verified", 1), ("tweet_type", 1)])
    coll.create_index([("reply.in_reply_to_user_id", 1)])
    print(f"  done in {time.time() - t0:.1f}s")


def main():
    drop = "--drop" in sys.argv
    client = MongoClient(MONGO_URI)
    coll = client[DB_NAME][COLL_NAME]

    if drop:
        print("Dropping collection...")
        coll.drop()

    total_inserted = 0
    total_skipped = 0
    t0 = time.time()

    for fname in FILES:
        path = DATA_DIR / fname
        print(f"\n=== {path} ===")
        if not path.exists():
            print("  missing, skipping")
            continue

        ops = []
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    raw = json.loads(line)
                except json.JSONDecodeError:
                    total_skipped += 1
                    continue

                doc = transform(raw)
                if doc is None:
                    total_skipped += 1
                    continue

                ops.append(UpdateOne({"_id": doc["_id"]}, {"$setOnInsert": doc}, upsert=True))

                if len(ops) >= BATCH_SIZE:
                    flush(coll, ops)
                    total_inserted += len(ops)
                    ops = []

                if i % 100000 == 0:
                    elapsed = time.time() - t0
                    rate = (total_inserted + len(ops)) / elapsed if elapsed else 0
                    sys.stdout.write(f"  line {i:>10,}  inserted ~{total_inserted:,}  "
                                     f"skipped {total_skipped:,}  {rate:,.0f}/s\n")
                    sys.stdout.flush()

        flush(coll, ops)
        total_inserted += len(ops)

    elapsed = time.time() - t0
    print(f"\nDone. upserts={total_inserted:,}  skipped={total_skipped:,}  elapsed={elapsed:,.1f}s")
    print(f"Final coll count: {coll.estimated_document_count():,}")

    create_indexes(coll)


if __name__ == "__main__":
    main()
