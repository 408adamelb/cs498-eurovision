"""
Run the two demo queries from Stage 2:
  Q2: country with most tweets
  Q4: top 100 hashtags by number of associated tweets

Also (re)creates the supporting indexes. createIndex is idempotent.
"""

import json
import os
import time
from pathlib import Path

from pymongo import MongoClient, ASCENDING

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = "eurovision"
COLL_NAME = "tweets"
RESULTS_DIR = Path(r"C:\Users\adame\cs498\results")


def main():
    RESULTS_DIR.mkdir(exist_ok=True)
    client = MongoClient(MONGO_URI)
    coll = client[DB_NAME][COLL_NAME]

    print(f"Collection size: {coll.estimated_document_count():,} tweets\n")

    print("Creating indexes (idempotent)...")
    t0 = time.time()
    coll.create_index([("place.country", ASCENDING)])
    coll.create_index([("entities.hashtags", ASCENDING)])  # multikey
    print(f"  done in {time.time() - t0:.1f}s\n")

    # ---------- Q2: country with most tweets ----------
    print("=" * 60)
    print("Q2: Country with the most tweets")
    print("=" * 60)
    t0 = time.time()
    pipeline_country = [
        {"$match": {"place.country": {"$ne": None}}},
        {"$group": {"_id": "$place.country", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
    ]
    countries = list(coll.aggregate(pipeline_country, allowDiskUse=True))
    print(f"  ran in {time.time() - t0:.1f}s")
    if countries:
        top = countries[0]
        print(f"\n  Winner: {top['_id']} with {top['tweet_count']:,} tweets\n")
        print("  Top 10 for context:")
        for c in countries[:10]:
            print(f"    {c['tweet_count']:>8,}  {c['_id']}")
    else:
        print("  (no geo-tagged tweets)")
    (RESULTS_DIR / "q2_country.json").write_text(
        json.dumps(countries, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # ---------- Q4: top 100 hashtags ----------
    print("\n" + "=" * 60)
    print("Q4: Top 100 hashtags by number of associated tweets")
    print("=" * 60)
    t0 = time.time()
    pipeline_hashtags = [
        {"$match": {"entities.hashtags": {"$exists": True, "$ne": []}}},
        {"$unwind": "$entities.hashtags"},
        {"$group": {"_id": "$entities.hashtags", "tweet_count": {"$sum": 1}}},
        {"$sort": {"tweet_count": -1}},
        {"$limit": 100},
    ]
    hashtags = list(coll.aggregate(pipeline_hashtags, allowDiskUse=True))
    print(f"  ran in {time.time() - t0:.1f}s\n")
    print(f"  Top 25 (full 100 saved to results/q4_hashtags.json):")
    for h in hashtags[:25]:
        print(f"    {h['tweet_count']:>8,}  #{h['_id']}")
    (RESULTS_DIR / "q4_hashtags.json").write_text(
        json.dumps(hashtags, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\nResults written to {RESULTS_DIR}")


if __name__ == "__main__":
    main()
