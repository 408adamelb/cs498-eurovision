import os

from flask import Flask, jsonify, render_template, request

import all_queries as q

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/q1")
def api_q1():
    sn = request.args.get("screen_name", "blcklcfr").strip() or "blcklcfr"
    return jsonify(q.q1_user_thread(sn))


@app.route("/api/q2")
def api_q2():
    return jsonify(q.q2_top_country(int(request.args.get("limit", 10))))


@app.route("/api/q3")
def api_q3():
    return jsonify(q.q3_top_user(int(request.args.get("limit", 10))))


@app.route("/api/q4")
def api_q4():
    return jsonify(q.q4_top_hashtags(int(request.args.get("limit", 100))))


@app.route("/api/q5")
def api_q5():
    return jsonify(q.q5_mutual_trios(int(request.args.get("limit", 25))))


@app.route("/api/q6")
def api_q6():
    return jsonify(q.q6_verified_user_breakdown(int(request.args.get("limit", 25))))


@app.route("/api/health")
def health():
    return {"ok": True, "mongo": q.coll().estimated_document_count()}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), debug=True)
