const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);

function getArg(name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] || fallback;
}

const statsDir = getArg("--stats-dir", ".");
const outPath = getArg("--out", path.join(statsDir, "repository-traffic-card.svg"));
const reportUrl = getArg("--report-url", "");
const repoName = getArg("--repo", "caya8205-2/noctune");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || "";
      return row;
    }, {});
  });
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function recentRows(rows, count) {
  return rows
    .filter((row) => row.time_iso8601)
    .sort((a, b) => a.time_iso8601.localeCompare(b.time_iso8601))
    .slice(-count);
}

function metricBlock(x, label, value, accent) {
  return `
    <g transform="translate(${x} 94)">
      <rect width="126" height="72" rx="12" fill="#111827" stroke="#243044"/>
      <text x="16" y="27" fill="#94a3b8" font-size="12">${escapeXml(label)}</text>
      <text x="16" y="55" fill="${accent}" font-size="26" font-weight="700">${escapeXml(formatNumber(value))}</text>
    </g>`;
}

function sparkBars(rows) {
  if (!rows.length) return "";

  const values = rows.map((row) => Number(row.views_total || 0));
  const max = Math.max(...values, 1);
  const width = 16;
  const gap = 5;

  return values
    .map((value, index) => {
      const height = Math.max(4, Math.round((value / max) * 42));
      const x = 28 + index * (width + gap);
      const y = 222 - height;
      const opacity = 0.45 + (index / Math.max(values.length - 1, 1)) * 0.45;
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="#38bdf8" opacity="${opacity.toFixed(2)}"/>`;
    })
    .join("\n      ");
}

function renderEmptyCard(message) {
  return `<svg width="620" height="280" viewBox="0 0 620 280" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Repository traffic for ${escapeXml(repoName)}</title>
  <desc id="desc">${escapeXml(message)}</desc>
  <rect width="620" height="280" rx="22" fill="#0B1020"/>
  <rect x="1" y="1" width="618" height="278" rx="21" stroke="#263247"/>
  <text x="28" y="54" fill="#F8FAFC" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="24" font-weight="700">Repository Traffic</text>
  <text x="28" y="85" fill="#94A3B8" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="14">${escapeXml(repoName)}</text>
  <text x="28" y="150" fill="#CBD5E1" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="18">${escapeXml(message)}</text>
  <text x="28" y="184" fill="#64748B" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="13">Run the stats workflow once to publish the first card.</text>
</svg>
`;
}

function renderCard(rows) {
  if (!rows.length) {
    return renderEmptyCard("Waiting for the first traffic snapshot");
  }

  const last14 = recentRows(rows, 14);
  const allTimeViews = sum(rows, "views_total");
  const uniqueViews = sum(rows, "views_unique");
  const allTimeClones = sum(rows, "clones_total");
  const uniqueClones = sum(rows, "clones_unique");
  const latestDate = last14[last14.length - 1]?.time_iso8601?.slice(0, 10) || "not available";
  const last14Views = sum(last14, "views_total");

  return `<svg width="620" height="280" viewBox="0 0 620 280" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Repository traffic for ${escapeXml(repoName)}</title>
  <desc id="desc">Traffic card showing views, clones, and recent activity.</desc>
  <style>
    text { font-family: Inter, Segoe UI, Arial, sans-serif; }
  </style>
  <rect width="620" height="280" rx="22" fill="#0B1020"/>
  <rect x="1" y="1" width="618" height="278" rx="21" stroke="#263247"/>
  <circle cx="542" cy="46" r="58" fill="#1D4ED8" opacity="0.22"/>
  <circle cx="586" cy="18" r="44" fill="#06B6D4" opacity="0.16"/>
  <text x="28" y="46" fill="#F8FAFC" font-size="24" font-weight="700">Repository Traffic</text>
  <text x="28" y="73" fill="#94A3B8" font-size="14">${escapeXml(repoName)} · updated ${escapeXml(latestDate)}</text>
  ${metricBlock(28, "Total views", allTimeViews, "#38BDF8")}
  ${metricBlock(174, "Unique views", uniqueViews, "#A78BFA")}
  ${metricBlock(320, "Total clones", allTimeClones, "#34D399")}
  ${metricBlock(466, "Unique clones", uniqueClones, "#FBBF24")}
  <g transform="translate(0 0)">
    <text x="28" y="197" fill="#CBD5E1" font-size="13">Last 14 days · ${escapeXml(formatNumber(last14Views))} views</text>
    ${sparkBars(last14)}
  </g>
  <text x="28" y="256" fill="#64748B" font-size="12">Source: GitHub traffic snapshots generated by github-repo-stats</text>
  ${reportUrl ? `<text x="428" y="256" fill="#38BDF8" font-size="12">${escapeXml(reportUrl.replace(/^https?:\/\//, ""))}</text>` : ""}
</svg>
`;
}

const csvPath = path.join(statsDir, "views_clones_aggregate.csv");
let svg;

if (fs.existsSync(csvPath)) {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  svg = renderCard(rows);
} else {
  svg = renderEmptyCard("Traffic data has not been generated yet");
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, svg);
console.log(`Wrote ${outPath}`);
