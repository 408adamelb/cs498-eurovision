// Build the Stage 2 prototype presentation.
// Run: node build_deck.js
// Outputs: deck.pptx in the same dir.

const path = require("path");
const pptxgen = require(path.join(
  "C:\\Users\\adame\\AppData\\Roaming\\npm\\node_modules",
  "pptxgenjs"
));

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
pres.title = "CS 498 Stage 2 — MongoDB Prototype";
pres.author = "Srikar Pisupati, Anirudh Venkatraman, Adam El Bahey";

// Palette: Midnight Executive
const NAVY = "1E2761";
const ICE = "CADCFC";
const WHITE = "FFFFFF";
const TEXT_DARK = "1A1A2E";
const MUTED = "5A6479";
const ACCENT = "F96167";

const HEADER_FONT = "Calibri";
const BODY_FONT = "Calibri";
const MONO_FONT = "Consolas";

// ---------- helpers ----------
function addTitleBar(slide, titleText, subtitle) {
  slide.addText(titleText, {
    x: 0.5, y: 0.3, w: 9, h: 0.6,
    fontFace: HEADER_FONT, fontSize: 28, bold: true,
    color: NAVY, margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.85, w: 9, h: 0.3,
      fontFace: BODY_FONT, fontSize: 12, italic: true, color: MUTED, margin: 0,
    });
  }
}

function addPageNumber(slide, n, total) {
  slide.addText(`${n} / ${total}`, {
    x: 9, y: 5.25, w: 0.8, h: 0.25,
    fontFace: BODY_FONT, fontSize: 9, color: MUTED, align: "right",
  });
}

const TOTAL = 8;

// ============================================================
// Slide 1 — Title
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  s.addText("Eurovision 2018 Tweets", {
    x: 0.6, y: 1.5, w: 8.8, h: 0.7,
    fontFace: HEADER_FONT, fontSize: 20, color: ICE, charSpacing: 4,
  });
  s.addText("MongoDB Prototype", {
    x: 0.6, y: 2.1, w: 8.8, h: 1.2,
    fontFace: HEADER_FONT, fontSize: 56, bold: true, color: WHITE, margin: 0,
  });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 3.3, w: 1.0, h: 0.06, fill: { color: ACCENT }, line: { type: "none" },
  });

  s.addText("CS 498 Cloud Computing Applications  ·  Stage 2", {
    x: 0.6, y: 3.5, w: 8.8, h: 0.4,
    fontFace: BODY_FONT, fontSize: 16, color: ICE,
  });
  s.addText("Srikar Pisupati  ·  Anirudh Venkatraman  ·  Adam El Bahey", {
    x: 0.6, y: 4.1, w: 8.8, h: 0.4,
    fontFace: BODY_FONT, fontSize: 14, color: WHITE,
  });
}

// ============================================================
// Slide 2 — Data Model Overview
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Data Model", "One BSON document per tweet — keep it natural, flatten only what queries need");

  // Left column — narrative
  s.addText([
    { text: "Why MongoDB", options: { bold: true, color: NAVY, fontSize: 16, breakLine: true } },
    { text: "Tweets ship as JSON. BSON is JSON.", options: { fontSize: 13, color: TEXT_DARK, breakLine: true } },
    { text: "Less reshaping at ingest, native arrays for hashtags.", options: { fontSize: 13, color: TEXT_DARK, breakLine: true } },
    { text: " ", options: { fontSize: 8, breakLine: true } },
    { text: "What we extract (the 6 queries' hot fields)", options: { bold: true, color: NAVY, fontSize: 16, breakLine: true } },
    { text: "tweet id, time, user, verified, reply links,", options: { bullet: true, fontSize: 13, color: TEXT_DARK, breakLine: true } },
    { text: "retweet/quote ids, hashtags, place country", options: { bullet: true, fontSize: 13, color: TEXT_DARK, breakLine: true } },
    { text: "tweet_type precomputed at load time", options: { bullet: true, fontSize: 13, color: TEXT_DARK } },
  ], { x: 0.5, y: 1.3, w: 4.4, h: 3.8, margin: 0, paraSpaceAfter: 4 });

  // Right column — example doc
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.3, w: 4.4, h: 3.8,
    fill: { color: "F4F6FB" }, line: { color: ICE, width: 1 },
  });
  s.addText("Example document", {
    x: 5.25, y: 1.35, w: 4.1, h: 0.3,
    fontFace: BODY_FONT, fontSize: 11, bold: true, color: NAVY, margin: 0,
  });
  const example = [
    "{",
    '  _id: 993723742768549888,',
    '  created_at: ISODate("2018-05-08..."),',
    '  tweet_type: "retweet",',
    '  user: { id: 4210815083,',
    '          screen_name: "PaulaKarwacka",',
    '          verified: false },',
    '  reply: { in_reply_to_status_id: null, ... },',
    '  retweeted_status_id: 9937234..,',
    '  entities: {',
    '    hashtags: ["eurovision","eurowizja"]',
    "  },",
    '  place: { country: "United Kingdom" }',
    "}",
  ].join("\n");
  s.addText(example, {
    x: 5.25, y: 1.7, w: 4.1, h: 3.3,
    fontFace: MONO_FONT, fontSize: 10.5, color: TEXT_DARK, margin: 0,
    valign: "top",
  });

  addPageNumber(s, 2, TOTAL);
}

// ============================================================
// Slide 3 — Ingestion + Indexes
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Loading & Indexing", "Stream NDJSON → trim → upsert in 5k batches → create indexes after");

  // Left: load pipeline
  s.addText("ETL pipeline", {
    x: 0.5, y: 1.3, w: 4.4, h: 0.3,
    fontFace: BODY_FONT, fontSize: 14, bold: true, color: NAVY, margin: 0,
  });
  s.addText([
    { text: "Read tweets line-by-line (NDJSON)", options: { bullet: { type: "number" }, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Skip stream-control records (limit/delete)", options: { bullet: { type: "number" }, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Lowercase hashtags so #ESC = #esc", options: { bullet: { type: "number" }, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Compute tweet_type at ingest", options: { bullet: { type: "number" }, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "bulk_write upserts in 5,000-doc batches", options: { bullet: { type: "number" }, fontSize: 12, color: TEXT_DARK } },
  ], { x: 0.5, y: 1.65, w: 4.4, h: 2.7, margin: 0, paraSpaceAfter: 3 });

  // Right: indexes box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.3, w: 4.4, h: 3.0,
    fill: { color: "F4F6FB" }, line: { color: ICE, width: 1 },
  });
  s.addText("Indexes used by the demo queries", {
    x: 5.25, y: 1.35, w: 4.1, h: 0.3,
    fontFace: BODY_FONT, fontSize: 11, bold: true, color: NAVY, margin: 0,
  });
  s.addText(
    'db.tweets.createIndex({ "place.country": 1 })\n' +
    'db.tweets.createIndex({ "entities.hashtags": 1 })\n' +
    "                            // multikey",
    { x: 5.25, y: 1.7, w: 4.1, h: 1.2,
      fontFace: MONO_FONT, fontSize: 11, color: TEXT_DARK, margin: 0, valign: "top" },
  );
  s.addText("Stage 2 plan listed 7 indexes; only the two above are needed for the queries we demo today.", {
    x: 5.25, y: 3.1, w: 4.1, h: 1.0,
    fontFace: BODY_FONT, fontSize: 11, italic: true, color: MUTED, margin: 0,
  });

  // Stat strip
  const stats = [
    { v: "795,473", l: "tweets ingested" },
    { v: "173 s", l: "load time (local)" },
    { v: "39 MB", l: "on-disk footprint" },
  ];
  stats.forEach((stat, i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 4.5, w: 2.9, h: 0.7, fill: { color: NAVY }, line: { type: "none" },
    });
    s.addText(stat.v, {
      x: x + 0.1, y: 4.5, w: 1.4, h: 0.7,
      fontFace: HEADER_FONT, fontSize: 22, bold: true, color: WHITE, valign: "middle", margin: 0,
    });
    s.addText(stat.l, {
      x: x + 1.55, y: 4.5, w: 1.3, h: 0.7,
      fontFace: BODY_FONT, fontSize: 11, color: ICE, valign: "middle", margin: 0,
    });
  });

  addPageNumber(s, 3, TOTAL);
}

// ============================================================
// Slide 4 — Q2: country with most tweets (with screenshot placeholder)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Query 2 — Country with the most tweets", "Group by place.country, sort desc, take top");

  // Left: pipeline
  s.addText("Aggregation pipeline", {
    x: 0.5, y: 1.3, w: 4.4, h: 0.3,
    fontFace: BODY_FONT, fontSize: 13, bold: true, color: NAVY, margin: 0,
  });
  s.addText(
    'db.tweets.aggregate([\n' +
    '  { $match: { "place.country": { $ne: null } } },\n' +
    '  { $group: {\n' +
    '      _id: "$place.country",\n' +
    '      tweet_count: { $sum: 1 } } },\n' +
    '  { $sort: { tweet_count: -1 } },\n' +
    '  { $limit: 1 }\n' +
    '])',
    { x: 0.5, y: 1.65, w: 4.4, h: 2.5,
      fontFace: MONO_FONT, fontSize: 11, color: TEXT_DARK, margin: 0, valign: "top" },
  );

  // Result callout
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: 4.3, w: 4.4, h: 0.85,
    fill: { color: NAVY }, line: { type: "none" },
  });
  s.addText("United Kingdom", {
    x: 0.65, y: 4.3, w: 2.6, h: 0.85,
    fontFace: HEADER_FONT, fontSize: 22, bold: true, color: WHITE, valign: "middle", margin: 0,
  });
  s.addText([
    { text: "6,041", options: { bold: true, color: ACCENT, fontSize: 22 } },
    { text: "  tweets", options: { color: ICE, fontSize: 14 } },
  ], { x: 3.1, y: 4.3, w: 1.75, h: 0.85, valign: "middle", align: "right", margin: 0 });

  // Right: SCREENSHOT PLACEHOLDER
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.3, w: 4.4, h: 3.85,
    fill: { color: "FAFBFE" }, line: { color: ICE, width: 1, dashType: "dash" },
  });
  s.addText("[ paste screenshot of query running here ]", {
    x: 5.1, y: 2.85, w: 4.4, h: 0.4,
    fontFace: BODY_FONT, fontSize: 13, italic: true, color: MUTED, align: "center", margin: 0,
  });
  s.addText("Atlas UI / mongosh / Compass output", {
    x: 5.1, y: 3.2, w: 4.4, h: 0.3,
    fontFace: BODY_FONT, fontSize: 10, color: MUTED, align: "center", margin: 0,
  });

  addPageNumber(s, 4, TOTAL);
}

// ============================================================
// Slide 5 — Q4: top 100 hashtags (with screenshot placeholder)
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Query 4 — Top 100 hashtags by tweet count", "$unwind the multikey hashtag array, group, sort, limit");

  // Left: pipeline
  s.addText("Aggregation pipeline", {
    x: 0.5, y: 1.3, w: 4.4, h: 0.3,
    fontFace: BODY_FONT, fontSize: 13, bold: true, color: NAVY, margin: 0,
  });
  s.addText(
    'db.tweets.aggregate([\n' +
    '  { $match: {\n' +
    '      "entities.hashtags": { $exists: true,\n' +
    '                             $ne: [] } } },\n' +
    '  { $unwind: "$entities.hashtags" },\n' +
    '  { $group: {\n' +
    '      _id: "$entities.hashtags",\n' +
    '      tweet_count: { $sum: 1 } } },\n' +
    '  { $sort: { tweet_count: -1 } },\n' +
    '  { $limit: 100 }\n' +
    '])',
    { x: 0.5, y: 1.65, w: 4.4, h: 2.8,
      fontFace: MONO_FONT, fontSize: 11, color: TEXT_DARK, margin: 0, valign: "top" },
  );

  // Top-5 mini-table for talking points
  s.addText("Top 5 (full list of 100 in results JSON)", {
    x: 0.5, y: 4.55, w: 4.4, h: 0.25,
    fontFace: BODY_FONT, fontSize: 11, italic: true, color: MUTED, margin: 0,
  });
  s.addTable([
    [
      { text: "#", options: { bold: true, fill: { color: NAVY }, color: WHITE, fontSize: 11 } },
      { text: "hashtag", options: { bold: true, fill: { color: NAVY }, color: WHITE, fontSize: 11 } },
      { text: "tweets", options: { bold: true, fill: { color: NAVY }, color: WHITE, fontSize: 11, align: "right" } },
    ],
    ["1", "#eurovision", { text: "591,213", options: { align: "right" } }],
    ["2", "#esc2018", { text: "66,736", options: { align: "right" } }],
    ["3", "#allaboard", { text: "54,319", options: { align: "right" } }],
  ], {
    x: 0.5, y: 4.8, w: 4.4, colW: [0.4, 2.6, 1.4],
    fontFace: BODY_FONT, fontSize: 10, color: TEXT_DARK,
    border: { pt: 0.5, color: ICE },
  });

  // Right: SCREENSHOT PLACEHOLDER
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: 1.3, w: 4.4, h: 3.85,
    fill: { color: "FAFBFE" }, line: { color: ICE, width: 1, dashType: "dash" },
  });
  s.addText("[ paste screenshot of query running here ]", {
    x: 5.1, y: 2.85, w: 4.4, h: 0.4,
    fontFace: BODY_FONT, fontSize: 13, italic: true, color: MUTED, align: "center", margin: 0,
  });
  s.addText("show top 25 of 100 in the screenshot", {
    x: 5.1, y: 3.2, w: 4.4, h: 0.3,
    fontFace: BODY_FONT, fontSize: 10, color: MUTED, align: "center", margin: 0,
  });

  addPageNumber(s, 5, TOTAL);
}

// ============================================================
// Slide 6 — Critique of the data model & query plans
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Critique", "What we'd change with hindsight");

  // Two columns: "What worked" / "What we'd change"
  const colY = 1.35;
  const colH = 3.7;

  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: colY, w: 4.4, h: 0.45,
    fill: { color: NAVY }, line: { type: "none" },
  });
  s.addText("What worked", {
    x: 0.6, y: colY, w: 4.2, h: 0.45,
    fontFace: HEADER_FONT, fontSize: 14, bold: true, color: WHITE, valign: "middle", margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.5, y: colY + 0.45, w: 4.4, h: colH - 0.45,
    fill: { color: "F4F6FB" }, line: { color: ICE, width: 1 },
  });
  s.addText([
    { text: "One doc per tweet kept the model close to the wire format — minimal ETL bugs.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Multikey index on entities.hashtags made the top-100 query a 6-second aggregate on 800k docs.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "place.country index turned Q2 into a sub-second covered group-and-sort.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Lowercasing hashtags at load avoided GROUP BY surprises (#ESC vs #esc).", options: { bullet: true, fontSize: 12, color: TEXT_DARK } },
  ], { x: 0.7, y: colY + 0.55, w: 4.0, h: colH - 0.65, margin: 0, paraSpaceAfter: 5 });

  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: colY, w: 4.4, h: 0.45,
    fill: { color: ACCENT }, line: { type: "none" },
  });
  s.addText("What we'd change", {
    x: 5.2, y: colY, w: 4.2, h: 0.45,
    fontFace: HEADER_FONT, fontSize: 14, bold: true, color: WHITE, valign: "middle", margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 5.1, y: colY + 0.45, w: 4.4, h: colH - 0.45,
    fill: { color: "FFF4F4" }, line: { color: "F8C7C9", width: 1 },
  });
  s.addText([
    { text: "Materialize a (hashtag, count) summary collection for repeat dashboards instead of $unwind every time.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Pre-extract user→user reply edges into an interactions collection — Q5 (mutual-reply trios) needs a graph view we don't have.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Reconsider compound (verified, tweet_type) index — Q6 doesn't filter on verified, it groups; the index helps less than expected.", options: { bullet: true, fontSize: 12, color: TEXT_DARK, breakLine: true } },
    { text: "Drop fields we never query (urls, source, profile_*) at load — would shave ~30% off raw doc size.", options: { bullet: true, fontSize: 12, color: TEXT_DARK } },
  ], { x: 5.3, y: colY + 0.55, w: 4.0, h: colH - 0.65, margin: 0, paraSpaceAfter: 5 });

  addPageNumber(s, 6, TOTAL);
}

// ============================================================
// Slide 7 — Lessons learned + advice
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: WHITE };
  addTitleBar(s, "Lessons learned", "About MongoDB, and about cloud data work in general");

  const cards = [
    {
      title: "Indexes matter more than schema",
      body: "Switching one field from scan to index turned Q4 from minutes to seconds. The biggest performance levers were index choices, not document shape.",
    },
    {
      title: "Trim at ingest, not at query",
      body: "Raw tweets carry ~80 fields we never read. Dropping them in the loader cut storage 10x and made every aggregation faster.",
    },
    {
      title: "Atlas free tier is real",
      body: "M0 on GCP loaded the same 39 MB collection in under 10 minutes over residential internet. Useful for demos, capped at 512 MB.",
    },
    {
      title: "Eventual consistency isn't free",
      body: "Single-doc reads are strong. The moment you cross documents (e.g. mutual replies) you have to think about it yourself.",
    },
  ];
  const cw = 4.4, ch = 1.7;
  cards.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 0.5 + col * 4.6;
    const y = 1.3 + row * (ch + 0.2);

    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cw, h: ch, fill: { color: "F4F6FB" }, line: { color: ICE, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h: ch, fill: { color: NAVY }, line: { type: "none" },
    });
    s.addText(c.title, {
      x: x + 0.25, y: y + 0.1, w: cw - 0.35, h: 0.4,
      fontFace: HEADER_FONT, fontSize: 13, bold: true, color: NAVY, margin: 0,
    });
    s.addText(c.body, {
      x: x + 0.25, y: y + 0.55, w: cw - 0.35, h: ch - 0.65,
      fontFace: BODY_FONT, fontSize: 11, color: TEXT_DARK, margin: 0, valign: "top",
    });
  });

  addPageNumber(s, 7, TOTAL);
}

// ============================================================
// Slide 8 — Advice for someone considering MongoDB
// ============================================================
{
  const s = pres.addSlide();
  s.background = { color: NAVY };

  s.addText("Advice if you're considering MongoDB", {
    x: 0.6, y: 0.5, w: 8.8, h: 0.7,
    fontFace: HEADER_FONT, fontSize: 26, bold: true, color: WHITE, margin: 0,
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0.6, y: 1.25, w: 0.8, h: 0.05, fill: { color: ACCENT }, line: { type: "none" },
  });

  const tips = [
    { k: "Pick it for", v: "semi-structured data with arrays and nested objects, evolving schemas, read-heavy analytics over JSON-shaped sources." },
    { k: "Skip it for", v: "tightly-relational workloads with heavy multi-table joins or strict ACID across many entities." },
    { k: "Plan indexes early", v: "list your queries first, then design the index set. Multikey + compound covers most analytical needs." },
    { k: "Use Atlas to start", v: "M0 free tier gets you running on GCP in 5 minutes. Upgrade only when storage or RAM forces you." },
    { k: "Trim at load", v: "raw API JSON is expensive to store. Keep the doc but drop fields no query reads." },
  ];

  tips.forEach((t, i) => {
    const y = 1.55 + i * 0.65;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 8.8, h: 0.55, fill: { color: "FFFFFF", transparency: 92 }, line: { type: "none" },
    });
    s.addText(t.k, {
      x: 0.8, y, w: 2.4, h: 0.55,
      fontFace: HEADER_FONT, fontSize: 13, bold: true, color: ACCENT, valign: "middle", margin: 0,
    });
    s.addText(t.v, {
      x: 3.2, y, w: 6.0, h: 0.55,
      fontFace: BODY_FONT, fontSize: 12, color: ICE, valign: "middle", margin: 0,
    });
  });

  s.addText("Thank you  ·  Questions?", {
    x: 0.6, y: 5.1, w: 8.8, h: 0.4,
    fontFace: BODY_FONT, fontSize: 12, italic: true, color: ICE, align: "center", margin: 0,
  });
}

pres.writeFile({ fileName: "deck.pptx" }).then((f) => {
  console.log("wrote", f);
});
