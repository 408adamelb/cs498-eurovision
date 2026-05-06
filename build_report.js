// Build the data analyst report as report.docx
// Run: node build_report.js
//
// Structured around the three required pillars: major decisions, lessons learned, my role.

const path = require("path");
const fs = require("fs");
const docx = require(path.join(
  "C:\\Users\\adame\\AppData\\Roaming\\npm\\node_modules",
  "docx"
));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
} = docx;

const FONT = "Calibri";

const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 160, line: 290 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    ...opts.paraProps,
    children: [new TextRun({ text, font: FONT, size: 22, ...opts.run })],
  });

const richP = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: 160, line: 290 },
    alignment: opts.align || AlignmentType.JUSTIFIED,
    ...opts.paraProps,
    children: runs.map((r) =>
      typeof r === "string"
        ? new TextRun({ text: r, font: FONT, size: 22 })
        : new TextRun({ font: FONT, size: 22, ...r })
    ),
  });

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true })],
  });

const title = (text) =>
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true })],
  });

const subtitle = (text) =>
  new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: true })],
  });

const meta = (text) =>
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, font: FONT, size: 20, italics: true, color: "555555" })],
  });

const children = [
  title("CS 498 — Stage 2 Individual Report"),
  subtitle("Adam El Bahey (elbahey2) — Data Analyst"),
  meta("Team: Srikar Pisupati, Anirudh Venkatraman, Adam El Bahey  ·  Twitter Eurovision 2018 dataset"),

  // ============================================================
  h1("Major Decisions"),

  richP([
    { text: "Choosing MongoDB over Cassandra and Redis. ", bold: true },
    "The most consequential decision we made was at the system level. The Twitter Eurovision 2018 dataset is roughly 800,000 tweets across two NDJSON files (3.7 GB raw), and the six required queries are exploratory: group-bys on country, $unwind operations on hashtag arrays, reply-graph traversals, and per-user aggregations. Cassandra's wide-column model is engineered for predictable, primary-key-driven access and discourages secondary indexes at scale, which would have made our hashtag and reply-graph queries painful. Redis is fast for raw key lookups but a poor fit for nested document analytics — the 512 MB-class instances would have forced us to flatten and shard the data manually. MongoDB's BSON document model maps almost directly onto raw tweet JSON, its multikey indexes natively support hashtag arrays, and its aggregation framework gives us SQL-like primitives ($match, $group, $unwind, $sort, $limit) over those documents. For a dataset that is fundamentally semi-structured and read-heavy, MongoDB demanded the least friction between the data and the questions we wanted to ask.",
  ]),

  richP([
    { text: "Schema: one document per tweet, selectively flattened. ", bold: true },
    "We rejected two extremes early. Storing each raw tweet untouched would have forced every query to navigate a deep, inconsistent shape with optional fields. Splitting into normalized collections for users, tweets, hashtags, and replies would have introduced join-like $lookup stages that MongoDB is not optimized for. Our middle-ground design keeps one document per tweet but extracts the fields the six queries actually touch — tweet id, time, user identity and verification, reply linkage, retweet/quote ids, hashtags, and place country — and precomputes a tweet_type field of \"simple\", \"reply\", \"retweet\", or \"quote\" at ingest. This decision moved the cost of classification from query time to load time, which we only pay once.",
  ]),

  richP([
    { text: "Indexing for the questions we actually ask. ", bold: true },
    "Rather than over-index, we listed every query's filter and group-by fields and built only the indexes those queries needed: a single-field index on place.country, a multikey index on entities.hashtags, and compound indexes for the user- and reply-driven queries. Lowercasing hashtags during ETL was a small but important decision — it ensures #Eurovision and #eurovision collapse to the same key in the multikey index instead of inflating the cardinality.",
  ]),

  richP([
    { text: "Cloud target: MongoDB Atlas on GCP. ", bold: true },
    "We deployed the same prototype to MongoDB Atlas hosted in Google Cloud to demonstrate that the design is portable and not tied to a developer laptop. The same loader and the same query script run unchanged against Atlas with only the connection URI changed.",
  ]),

  // ============================================================
  h1("Lessons Learned"),

  richP([
    { text: "Index choices outweigh schema cleverness. ", bold: true },
    "The single biggest performance lever was the multikey index on entities.hashtags. Without it, the top-100 hashtag query is a full collection scan over 800,000 documents and several seconds of $unwind work. With it, the same query runs in roughly six seconds locally and three on Atlas. No amount of schema tuning would have given us the same gain.",
  ]),

  richP([
    { text: "Trim at ingest, not at query time. ", bold: true },
    "Raw tweet JSON carries about eighty fields we never read — source string, profile background colors, follower counts, time-zone metadata. Stripping those at load reduced the on-disk footprint to 39 MB for the full collection and made every aggregation faster because Mongo touches fewer bytes per document.",
  ]),

  richP([
    { text: "Network latency dominates loading; compute does not. ", bold: true },
    "Loading the full collection took 173 seconds against local MongoDB and 23 minutes against Atlas on GCP. The Atlas cluster is faster than my laptop on the queries themselves, but each 5,000-document batch crosses the public internet to reach it. The lesson is that for cloud loading, geographic proximity and bulk batch size matter more than instance class.",
  ]),

  richP([
    { text: "MongoDB Atlas's free tier is genuinely usable. ", bold: true },
    "The M0 free tier on GCP comfortably held our 39 MB collection with both indexes, ran our two demonstration queries in seconds, and required no credit card. For class projects and small prototypes this lowers the cost of cloud experimentation to effectively zero.",
  ]),

  richP([
    { text: "Sample previews are not real query results. ", bold: true },
    "An early surprise: the Atlas Aggregation Builder's pipeline preview runs each stage on a ten-document sample, not the full collection. Numbers from the preview are meaningless until you click Run. A small UX detail, but a good general lesson — always confirm what data a tool is actually showing you.",
  ]),

  // ============================================================
  h1("My Role in the Project"),

  p(
    "My responsibility on this team was the data-analyst role, defined in our Stage 1 plan as querying the data and analyzing the results. In practice this meant translating our team's storage and schema decisions into actual analytical answers, validating that those answers were defensible, and feeding query patterns back into our schema and indexing choices."
  ),

  p(
    "Over the past few weeks I worked through every one of the six required queries on paper before they were implemented, mapping each to its required access path and confirming our schema exposed the right fields. That exercise is what surfaced two design changes from our initial sketch: precomputing tweet_type at ingest and lowercasing hashtags during ETL. For the two queries we are demonstrating in Stage 2, I authored the aggregation pipelines, validated the results against my own intuition about the dataset, and ran them against both the local MongoDB instance and the Atlas GCP cluster — both returned identical document counts and identical top-of-list results, which gave us confidence that the prototype is reproducible."
  ),

  p(
    "I also performed sanity passes on the output. The United Kingdom result for the top-country query is consistent with the Eurovision audience profile, and the dominance of #eurovision (591,213 tweets) followed by #esc2018 reflects the official versus shorthand naming convention used by Eurovision broadcasters in 2018. These cross-checks distinguish a query that ran successfully from a result that is actually trustworthy. Beyond the demo queries, I contributed to the team's index strategy by listing every query's required filter and group-by fields and arguing for the multikey index on entities.hashtags specifically because the top-100 query relies on $unwind. Finally, I prepared the analytical results for downstream presentation: the JSON exports of the country ranking and top-100 hashtags that the team uses in the Stage 2 deliverable, and the supporting commentary that explains why the numbers look the way they do."
  ),
];

const doc = new Document({
  creator: "Adam El Bahey",
  title: "CS 498 Stage 2 — Individual Report",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: "1E2761" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 0 },
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 }, // US Letter
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("report.docx", buf);
  console.log("wrote report.docx (" + buf.length + " bytes)");
});
