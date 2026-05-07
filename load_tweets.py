"""Load Eurovision tweets into MongoDB. Run with --drop to wipe first."""

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
TEXT_MAX = 320
TWITTER_TS_FMT = "%a %b %d %H:%M:%S %z %Y"


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, TWITTER_TS_FMT).astimezone(timezone.utc)
    except Exception:
        return None


def transform(raw):
    tid = raw.get("id")
    if tid is None:
        # not a tweet (limit/delete/etc.)
        return None

    in_reply = raw.get("in_reply_to_status_id")
    rt = raw.get("retweeted_status")
    qt = raw.get("quoted_status")

    if rt:
        ttype = "retweet"
    elif qt:
        ttype = "quote"
    elif in_reply is not None:
        ttype = "reply"
    else:
        ttype = "simple"

    u = raw.get("user") or {}
    doc = {
        "_id": tid,
        "created_at": parse_dt(raw.get("created_at")),
        "text": (raw.get("text") or "")[:TEXT_MAX],
        "tweet_type": ttype,
        "user": {
            "id": u.get("id"),
            "name": u.get("name"),
            "screen_name": u.get("screen_name"),
            "verified": bool(u.get("verified", False)),
        },
    }

    if in_reply is not None or raw.get("in_reply_to_user_id") is not None:
        doc["reply"] = {
            "in_reply_to_status_id": in_reply,
            "in_reply_to_user_id": raw.get("in_reply_to_user_id"),
            "in_reply_to_screen_name": raw.get("in_reply_to_screen_name"),
        }
    if rt and rt.get("id") is not None:
        doc["retweeted_status_id"] = rt["id"]
    if qt and qt.get("id") is not None:
        doc["quoted_status_id"] = qt["id"]

    hashtags = (raw.get("entities") or {}).get("hashtags") or []
    tags = [h["text"].lower() for h in hashtags if isinstance(h, dict) and h.get("text")]
    if tags:
        doc["entities"] = {"hashtags": tags}

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
        # duplicates are fine (rerunning), anything else is real
        errs = e.details.get("writeErrors", [])
        dups = sum(1 for w in errs if w.get("code") == 11000)
        if len(errs) - dups:
            print(f"  bulk: {dups} dup, {len(errs) - dups} other", file=sys.stderr)


def create_indexes(coll):
    print("\nCreating indexes...")
    t0 = time.time()
    coll.create_index([("user.screen_name", 1), ("created_at", 1)])
    coll.create_index([("reply.in_reply_to_status_id", 1)])
    coll.create_index([("reply.in_reply_to_user_id", 1)])
    coll.create_index([("user.id", 1), ("created_at", 1)])
    coll.create_index([("place.country", 1)])
    coll.create_index([("entities.hashtags", 1)])
    coll.create_index([("user.verified", 1), ("tweet_type", 1)])
    print(f"  done in {time.time() - t0:.1f}s")


def main():
    drop = "--drop" in sys.argv
    client = MongoClient(MONGO_URI)
    coll = client[DB_NAME][COLL_NAME]

    if drop:
        print("Dropping collection...")
        coll.drop()

    inserted = 0
    skipped = 0
    start = time.time()

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
                    skipped += 1
                    continue

                doc = transform(raw)
                if doc is None:
                    skipped += 1
                    continue

                ops.append(UpdateOne({"_id": doc["_id"]}, {"$setOnInsert": doc}, upsert=True))

                if len(ops) >= BATCH_SIZE:
                    flush(coll, ops)
                    inserted += len(ops)
                    ops = []

                if i % 100000 == 0:
                    rate = (inserted + len(ops)) / (time.time() - start)
                    print(f"  {i:>10,}  ~{inserted:,} ins  {skipped:,} skip  {rate:,.0f}/s", flush=True)

        flush(coll, ops)
        inserted += len(ops)

    print(f"\nDone. upserts={inserted:,}  skipped={skipped:,}  elapsed={time.time() - start:,.1f}s")
    print(f"Final coll count: {coll.estimated_document_count():,}")
    create_indexes(coll)


if __name__ == "__main__":
    main()
