const $ = (id) => document.getElementById(id);

const fmt = (n) => (n == null ? "" : n.toLocaleString());

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const meta = (sec, extra = "") =>
  `<div class="meta">Ran in <strong>${sec}s</strong>${extra ? " · " + extra : ""}</div>`;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function renderQ1(d) {
  if (!d.total_tweets) {
    return `<div class="meta">No tweets found for screen_name <strong>${d.screen_name}</strong>.</div>`;
  }
  let html = meta(
    d.elapsed_s,
    `User <strong>@${d.screen_name}</strong> · ${d.total_tweets} tweets, ${d.thread_count} thread(s)`
  );
  d.threads.forEach((thread, i) => {
    html += `<div class="thread"><strong>Thread ${i + 1}</strong>`;
    for (const t of thread) {
      const indent = "&nbsp;".repeat(t.depth * 4);
      const replyTo = t.in_reply_to_screen_name ? ` → @${t.in_reply_to_screen_name}` : "";
      html += `<div class="tw"><span class="when">${t.created_at} · ${t.tweet_type}${replyTo} · id ${t.id}</span><div class="body">${indent}${escapeHtml(t.text || "")}</div></div>`;
    }
    html += `</div>`;
  });
  return html;
}

function renderQ2(d) {
  let html = meta(
    d.elapsed_s,
    d.winner ? `Winner: <strong>${escapeHtml(d.winner._id)}</strong> · ${fmt(d.winner.tweet_count)} tweets` : "no result"
  );
  html += `<table><thead><tr><th>#</th><th>country</th><th class='num'>tweets</th></tr></thead><tbody>`;
  d.top.forEach((r, i) => {
    html += `<tr><td>${i + 1}</td><td>${escapeHtml(r.country)}</td><td class="num">${fmt(r.tweet_count)}</td></tr>`;
  });
  return html + "</tbody></table>";
}

function renderQ3(d) {
  const w = d.winner;
  let html = meta(
    d.elapsed_s,
    w ? `Winner: <strong>@${escapeHtml(w.screen_name || "")}</strong> · ${fmt(w.tweet_count)} tweets` : "no result"
  );
  html += `<table><thead><tr><th>#</th><th>screen_name</th><th>name</th><th>verified</th><th class='num'>tweets</th></tr></thead><tbody>`;
  d.top.forEach((r, i) => {
    html += `<tr><td>${i + 1}</td><td>@${escapeHtml(r.screen_name || "")}</td><td>${escapeHtml(r.name || "")}</td><td>${r.verified ? "✓" : ""}</td><td class="num">${fmt(r.tweet_count)}</td></tr>`;
  });
  return html + "</tbody></table>";
}

function renderQ4(d) {
  const max = d.top.length ? d.top[0].tweet_count : 1;
  let html = meta(d.elapsed_s, `${d.top.length} hashtags`);
  html += `<table><thead><tr><th>#</th><th>hashtag</th><th class='num'>tweets</th><th></th></tr></thead><tbody>`;
  d.top.forEach((r, i) => {
    const w = Math.max(2, Math.round((r.tweet_count / max) * 200));
    html += `<tr><td>${i + 1}</td><td>#${escapeHtml(r.hashtag)}</td><td class="num">${fmt(r.tweet_count)}</td><td><span class="bar" style="width:${w}px"></span></td></tr>`;
  });
  return html + "</tbody></table>";
}

function renderQ5(d) {
  let html = meta(
    d.elapsed_s,
    `${fmt(d.directed_edges)} directed edges · ${fmt(d.mutual_pairs)} mutual pairs · <strong>${fmt(d.trio_count_total)} trios</strong>`
  );
  if (!d.trios.length) {
    return html + `<div class="meta">No trios in dataset.</div>`;
  }
  const cell = (u) => `<div>@${escapeHtml(u.screen_name || String(u.user_id))}<br><small style="color:#5a6479">${escapeHtml(u.name || "")}</small></div>`;
  html += `<table><thead><tr><th>#</th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>`;
  d.trios.forEach((trio, i) => {
    html += `<tr><td>${i + 1}</td><td>${cell(trio[0])}</td><td>${cell(trio[1])}</td><td>${cell(trio[2])}</td></tr>`;
  });
  return html + "</tbody></table>";
}

function renderQ6(d) {
  let html = meta(d.elapsed_s, `${d.rows.length} verified users`);
  html += `<table><thead><tr><th>screen_name</th><th class='num'>total</th><th class='num'>simple %</th><th class='num'>reply %</th><th class='num'>retweet %</th><th class='num'>quote %</th></tr></thead><tbody>`;
  for (const r of d.rows) {
    html += `<tr><td>@${escapeHtml(r.screen_name || "")}</td><td class="num">${fmt(r.total)}</td><td class="num">${r.percent.simple}</td><td class="num">${r.percent.reply}</td><td class="num">${r.percent.retweet}</td><td class="num">${r.percent.quote}</td></tr>`;
  }
  return html + "</tbody></table>";
}

const renderers = {
  q1: renderQ1, q2: renderQ2, q3: renderQ3,
  q4: renderQ4, q5: renderQ5, q6: renderQ6,
};

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-q]");
  if (!btn) return;

  const q = btn.dataset.q;
  const out = $(`${q}_out`);
  out.innerHTML = "";

  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Running...";

  let url = `/api/${q}`;
  if (q === "q1") {
    url += `?screen_name=${encodeURIComponent($("q1_sn").value)}`;
  }

  try {
    const data = await fetchJson(url);
    out.innerHTML = renderers[q](data);
  } catch (err) {
    out.innerHTML = `<div class="error">Error: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});
