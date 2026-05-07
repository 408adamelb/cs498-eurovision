# CS 498 — Stage 2 MongoDB Prototype

Twitter Eurovision 2018 dataset (~795k tweets) loaded into MongoDB, with all six required analytical queries implemented and a Flask web frontend.

**Live demo:** https://eurovision-app-283669799369.us-central1.run.app
*(Cloud Run + MongoDB Atlas on GCP. Cold start ~3 seconds; queries return in <1s after warm-up.)*

**Team:** Srikar Pisupati (srikarp3), Anirudh Venkatraman (av47), Adam El Bahey (elbahey2)

---

## What's in this repo

| File | Purpose |
|---|---|
| `load_tweets.py` | Streams the two NDJSON files into MongoDB with the trimmed Stage 2 schema; creates the 7 supporting indexes |
| `all_queries.py` | All six query implementations as plain Python functions returning JSON-serializable dicts |
| `app.py` | Flask app exposing each query at `/api/qN` plus a single-page HTML UI |
| `templates/index.html`, `static/` | Frontend (no build step, vanilla JS + CSS) |
| `Dockerfile`, `requirements.txt`, `.dockerignore` | Container build for GCP Cloud Run |
| `ping.py`, `sizecheck.py` | Tiny diagnostic scripts |
| `queries.py` | Earlier 2-query script (Q2 + Q4 only) — kept for the slide demo |
| `deck.pptx`, `report.docx`, `report.md` | Stage 2 deliverables |
| `build_deck.js`, `build_report.js` | Scripts that generated the deck and report |
| `498projreport.docx`, `498projreport.pdf` | Combined team report |
| `results/` | JSON output of Q2 (top countries) and Q4 (top 100 hashtags) |

The raw 3.7 GB Eurovision NDJSON files are **not** committed (see `.gitignore`). Original source: Twitter Eurovision 2018 dataset on Kaggle / public archives.

---

## Schema

One document per tweet, only the fields the six queries need:

```javascript
{
  _id: <tweet id>,
  created_at: <Date>,
  text: <truncated to 320 chars>,
  tweet_type: "simple" | "reply" | "retweet" | "quote",
  user:    { id, name, screen_name, verified },
  reply:   { in_reply_to_status_id, in_reply_to_user_id, in_reply_to_screen_name },
  retweeted_status_id, quoted_status_id,
  entities: { hashtags: [<lowercased>...] },
  place:    { country, full_name, country_code }
}
```

Indexes: `place.country`, `entities.hashtags` (multikey), `user.screen_name + created_at`, `user.id + created_at`, `reply.in_reply_to_status_id`, `reply.in_reply_to_user_id`, `user.verified + tweet_type`.

---

## Running locally

### 1. Install dependencies

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

### 2. Start MongoDB
Install MongoDB Community Server (default port 27017) or set `MONGO_URI` to point at Atlas.

### 3. Load data
Place `Eurovision.json` and `Eurovision2.json` in `./data/`, then:

```bash
.venv/Scripts/python load_tweets.py --drop
```

Takes ~3 min on a local instance. Use `MONGO_URI=mongodb+srv://...` for Atlas (~25 min over network).

### 4. Run the Flask UI

```bash
.venv/Scripts/python app.py
```

Open <http://localhost:8080>. Each query has a Run button.

---

## Deploying to GCP Cloud Run

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
gcloud artifacts repositories create cs498 --repository-format=docker --location=us-central1
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cs498/eurovision-app:v1
gcloud run deploy eurovision-app \
  --image us-central1-docker.pkg.dev/YOUR_PROJECT_ID/cs498/eurovision-app:v1 \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars MONGO_URI="mongodb+srv://USER:PASS@CLUSTER/?appName=APP" \
  --memory 512Mi --cpu 1 --timeout 300
```

The deploy command prints a public URL. The service connects to MongoDB Atlas over the public internet (Atlas IP allowlist must include `0.0.0.0/0` or use VPC Private Service Connect).

---

## Query summary (full data)

| # | Query | Result |
|---|---|---|
| 1 | Reply thread by `blcklcfr` | 9 tweets across N threads |
| 2 | Country with most tweets | **United Kingdom** — 6,041 |
| 3 | User with most tweets | **@escmemes** — 541 |
| 4 | Top 100 hashtags | **#eurovision** — 591,213 |
| 5 | Mutual-reply trios | **6 trios** out of 802 mutual pairs |
| 6 | Verified user tweet-type % | top: SBS Australia (276 tweets) |

---

## License / data

Source dataset is public Twitter snapshot data; this repo only contains code and aggregate results.
