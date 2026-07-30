import { readFile, writeFile } from "node:fs/promises";

const README_PATH = new URL("../README.md", import.meta.url);
const FEED_URL = "https://brucebawest.com/blog/latest.json";
const SITE_URL = "https://brucebawest.com";
const START_MARKER = "<!-- FIELD-NOTES:START -->";
const END_MARKER = "<!-- FIELD-NOTES:END -->";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function assertArticle(article, index) {
  if (!article || typeof article !== "object") {
    throw new Error(`Feed item ${index + 1} must be an object.`);
  }

  for (const field of ["title", "description", "href", "date", "category", "readTime"]) {
    if (!(field in article)) {
      throw new Error(`Feed item ${index + 1} is missing ${field}.`);
    }
  }

  const url = new URL(String(article.href), SITE_URL);
  if (url.origin !== SITE_URL || !url.pathname.startsWith("/blog/")) {
    throw new Error(`Feed item ${index + 1} has an unexpected URL.`);
  }

  const readTime = Number(article.readTime);
  if (!Number.isInteger(readTime) || readTime < 1 || readTime > 240) {
    throw new Error(`Feed item ${index + 1} has an invalid read time.`);
  }

  const date = new Date(`${article.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Feed item ${index + 1} has an invalid date.`);
  }

  return { ...article, url, readTime, date };
}

function renderArticle(article) {
  const date = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(article.date).toUpperCase();
  const category = escapeHtml(article.category).toUpperCase();

  return [
    "  <tr>",
    `    <td width="22%" valign="top"><code>${date}</code><br><sub>${category} · ${article.readTime} MIN</sub></td>`,
    `    <td valign="top"><a href="${escapeHtml(article.url.href)}"><strong>${escapeHtml(article.title)}</strong></a><br>${escapeHtml(article.description)}</td>`,
    "  </tr>",
  ].join("\n");
}

async function main() {
  const response = await fetch(FEED_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Field Notes feed returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error("Field Notes feed did not contain any items.");
  }

  const articles = payload.items.slice(0, 3).map(assertArticle);
  const rendered = [
    START_MARKER,
    "<table>",
    ...articles.map(renderArticle),
    "</table>",
    END_MARKER,
  ].join("\n");

  const readme = await readFile(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("README Field Notes markers are missing or out of order.");
  }

  const nextReadme = `${readme.slice(0, start)}${rendered}${readme.slice(end + END_MARKER.length)}`;
  await writeFile(README_PATH, nextReadme, "utf8");
}

await main();
