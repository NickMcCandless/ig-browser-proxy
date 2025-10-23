const express = require("express");
const cors = require("cors");
const { LRUCache } = require("lru-cache");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());

const cache = new LRUCache({ max: 200, ttl: 1000 * 60 * 5 }); // 5 min cache
let browserPromise;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      channel: "chrome",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process"
      ]
    });
  }
  return browserPromise;
}

function isInstagram(u) {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)instagram\.com$/i.test(h);
  } catch {
    return false;
  }
}

async function fetchRendered(url) {
  const cached = cache.get(url);
  if (cached) return cached;

  const browser = await getBrowser();
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.instagram.com/"
    });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const r = req.resourceType();
      if (r === "image" || r === "media" || r === "font" || r === "stylesheet") {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });

    // Wait for some profile/post signals; don't hang forever
    await Promise.race([
      page.waitForSelector('meta[property="og:description"]', { timeout: 7000 }),
      page.waitForSelector('script[type="application/ld+json"]', { timeout: 7000 }),
      page.waitForSelector('article', { timeout: 7000 })
    ]).catch(() => {});

    const html = await page.content();
    if (!html || html.length < 1000) throw new Error("thin_html");
    cache.set(url, html);
    return html;
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
}

app.get("/fetch", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send("missing ?url=");
  if (!isInstagram(url)) return res.status(403).send("only instagram allowed");

  try {
    const html = await fetchRendered(url);
    res.set("Content-Type", "text/html; charset=utf-8");
    // small caches for speed
    res.set("Cache-Control", "public, max-age=300");
    return res.status(200).send(html);
  } catch (e) {
    return res.status(502).json({ error: e.message || String(e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("proxy listening on " + PORT));
