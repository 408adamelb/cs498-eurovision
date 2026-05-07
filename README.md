# CS 498 Stage 2 — MongoDB Prototype

Twitter Eurovision 2018 dataset (~795k tweets) loaded into MongoDB. All six required queries are implemented and exposed through a small Flask UI.

Live demo: https://eurovision-app-283669799369.us-central1.run.app

Team: Srikar Pisupati (srikarp3), Anirudh Venkatraman (av47), Adam El Bahey (elbahey2)


## Layout

- `load_tweets.py` — streams the two NDJSON files into MongoDB and creates the indexes
- `all_queries.py` — Q1 through Q6 as plain Python functions
- `app.py` + `templates/` + `static/` — Flask UI
- `Dockerfile`, `requirements.txt` — container build for Cloud Run
- `deck.pptx`, `report.docx`, `report.md`, `498projreport.{docx,pdf}` — write-ups
- `results/` — JSON dumps of Q2 and Q4
- `queries.py`, `ping.py`, `sizecheck.py` — leftover scripts from earlier stages

The 3.7 GB raw NDJSON dataset is `.gitignore`d.


## Schema

One document per tweet, with only the fields any of the six queries reads:

```js
{
  _id: <tweet id>,
  created_at: <Date>,
  text: <truncated to 320 chars>,
  tweet_type: "simple" | "reply" | "retweet" | "quote",
  user:    { id, name, screen_name, verified },
  reply:   { in_reply_to_status_id, in_reply_to_user_id, in_reply_to_screen_name },
  retweeted_status_id,
  quoted_status_id,
  entities: { hashtags: [...] },
  place:    { country, full_name, country_code }
}
```

Indexes:

- `place.country`
- `entities.hashtags` (multikey)
- `user.screen_name + created_at`
- `user.id + created_at`
- `reply.in_reply_to_status_id`
- `reply.in_reply_to_user_id`
- `user.verified + tweet_type`


## Running locally

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt

# point MONGO_URI at Atlas if you don't have a local mongod
.venv/Scripts/python load_tweets.py --drop
.venv/Scripts/python app.py
```

Open http://localhost:8080.


## Deploying to Cloud Run

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

Atlas needs the Cloud Run egress allowed; for a class demo `0.0.0.0/0` works.


## Results on the full dataset

- Q1 — `@blcklcfr` posted 9 tweets in this dataset
- Q2 — country: United Kingdom (6,041)
- Q3 — user: @escmemes (541)
- Q4 — hashtag: #eurovision (591,213)
- Q5 — 6 mutual-reply trios out of 802 mutual pairs
- Q6 — top verified user: @SBS (276 tweets)
