#!/usr/bin/env python3
"""
WowVets Scraper — requests + BeautifulSoup
Parses clinic data from visible HTML article elements (no JSON extraction).

City discovery strategy:
  1. cityAutocomplete list embedded in RSC payload on each category page (~80 top cities)
  2. All 50 state pages: /category/state-name → city links
  3. Pagination via ?page=N

Output: wowvets_clinics.csv

Usage:
    pip install requests beautifulsoup4 lxml
    python wowvets_scraper.py
"""

import re
import csv
import json
import time
import random
import logging
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

BASE_URL   = "https://wowvets.com"
OUTPUT_FILE = "wowvets_clinics.csv"

CATEGORIES = [
    ("animal-hospital-near-me",        "Animal Hospital"),
    ("veterinarian-near-me",           "Veterinarian"),
    ("emergency-veterinarian-near-me", "Emergency Vet"),
]

FIELDNAMES = [
    "category", "name", "address", "city", "state", "state_short",
    "phone", "website", "rating", "bid", "source_url"
]

# All 50 US states as URL slugs
US_STATE_SLUGS = [
    "alabama", "alaska", "arizona", "arkansas", "california",
    "colorado", "connecticut", "delaware", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa",
    "kansas", "kentucky", "louisiana", "maine", "maryland",
    "massachusetts", "michigan", "minnesota", "mississippi", "missouri",
    "montana", "nebraska", "nevada", "new-hampshire", "new-jersey",
    "new-mexico", "new-york", "north-carolina", "north-dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode-island", "south-carolina",
    "south-dakota", "tennessee", "texas", "utah", "vermont",
    "virginia", "washington", "west-virginia", "wisconsin", "wyoming",
]

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
})


# ── HTTP ───────────────────────────────────────────────────────────────────────

def fetch(url, retries=3):
    for attempt in range(1, retries + 1):
        try:
            r = SESSION.get(url, timeout=20)
            r.raise_for_status()
            time.sleep(random.uniform(0.5, 1.0))
            return r.text
        except requests.RequestException as e:
            log.warning(f"Attempt {attempt} failed for {url}: {e}")
            if attempt < retries:
                time.sleep(3 * attempt)
    return None


# ── Parse businesses from HTML articles ───────────────────────────────────────

def parse_articles(html, category_label, source_url):
    """Parse clinic data from <article class='wv-clinic-item'> elements."""
    soup = BeautifulSoup(html, "lxml")
    records = []

    for article in soup.select("article.wv-clinic-item"):
        rec = {
            "category":    category_label,
            "name":        "",
            "address":     "",
            "city":        "",
            "state":       "",
            "state_short": "",
            "phone":       "",
            "website":     "",
            "rating":      "",
            "bid":         "",
            "source_url":  source_url,
        }

        # Name + bid from the clinic link
        name_a = article.select_one(".wv-clinic-item-name a")
        if name_a:
            rec["name"] = name_a.get_text(strip=True)
            # href: /state/city-slug/clinic-name-BID
            href = name_a.get("href", "")
            bid_m = re.search(r'-(\d+)$', href)
            if bid_m:
                rec["bid"] = bid_m.group(1)

        # Meta rows: first span-only row = address; tel: = phone; http = website
        for row in article.select(".wv-clinic-meta-row"):
            href = row.get("href", "")
            text = row.get_text(strip=True)
            if href.startswith("tel:"):
                rec["phone"] = href.replace("tel:", "").strip()
            elif href.startswith("http"):
                # skip "Visit website" label — the href IS the website
                rec["website"] = href
            elif not href and text and not rec["address"]:
                rec["address"] = text

        # Rating
        rating_el = article.select_one(".wv-clinic-item-rating")
        if rating_el:
            rating_text = rating_el.get_text(strip=True)
            rating_m = re.search(r'[\d.]+', rating_text)
            if rating_m:
                rec["rating"] = rating_m.group()

        records.append(rec)

    return records


def get_total_pages(html):
    """Extract total page count from pagination section."""
    soup = BeautifulSoup(html, "lxml")
    # Look for "Page 1 of N" or pagination page links
    info = soup.select_one(".wv-pagination-info")
    if info:
        m = re.search(r'of\s*(\d+)', info.get_text())
        if m:
            return int(m.group(1))
    # Fallback: count page links
    pages = soup.select(".wv-pagination-pages .wv-pagination-page")
    if pages:
        nums = []
        for p in pages:
            t = p.get_text(strip=True)
            if t.isdigit():
                nums.append(int(t))
        if nums:
            return max(nums)
    return 1


# ── City discovery ─────────────────────────────────────────────────────────────

# Regex to pull cityAutocomplete slugs from the RSC payload
# Looks for: "slug":"houston-tx" inside the cityAutocomplete array
CITY_SLUG_RE = re.compile(r'"slug"\s*:\s*"([a-z0-9\-\.]+)"')


def extract_city_slugs_from_html(html, category_slug):
    """
    Two sources:
    1. cityAutocomplete JSON in RSC payload (top ~80 cities)
    2. Any hrefs of the form /category/city-slug in anchor tags
    """
    city_slugs = set()

    # Source 1: cityAutocomplete in RSC payload
    # Find the section containing cityAutocomplete and extract slugs
    ca_match = re.search(r'"cityAutocomplete"\s*:\s*\[(.+?)\]', html, re.DOTALL)
    if ca_match:
        # The array content is JSON-string-escaped (inside a JS string)
        # Unescape \" → " then parse
        raw = ca_match.group(1).replace('\\"', '"').replace('\\\\', '\\')
        try:
            cities = json.loads('[' + raw + ']')
            for c in cities:
                slug = c.get("slug", "")
                if slug:
                    city_slugs.add(slug)
        except Exception:
            # Fallback: just grab slug values with regex
            for m in CITY_SLUG_RE.finditer(ca_match.group(0)):
                city_slugs.add(m.group(1))

    # Source 2: anchor hrefs
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        parts = href.strip("/").split("/")
        if len(parts) == 2 and parts[0] == category_slug:
            city_slugs.add(parts[1])

    return city_slugs


def collect_cities_from_state(category_slug, state_slug):
    """
    Fetch /category/state and return all city slugs.
    City slugs end with a 2-letter state abbreviation (e.g. raleigh-nc).
    """
    url = f"{BASE_URL}/{category_slug}/{state_slug}"
    html = fetch(url)
    if html is None:
        return set()

    city_slugs = set()
    soup = BeautifulSoup(html, "lxml")
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        parts = href.strip("/").split("/")
        if len(parts) == 2 and parts[0] == category_slug:
            candidate = parts[1]
            # City slugs end in -XX (2-letter state code)
            tail = candidate.rsplit("-", 1)
            if len(tail) == 2 and len(tail[-1]) == 2 and tail[-1].isalpha():
                city_slugs.add(candidate)

    return city_slugs


# ── Scrape a city (all pages) ──────────────────────────────────────────────────

def scrape_city(category_slug, category_label, city_slug):
    base_url = f"{BASE_URL}/{category_slug}/{city_slug}"
    all_records = []
    page = 1

    while True:
        url = base_url if page == 1 else f"{base_url}?page={page}"
        html = fetch(url)
        if html is None:
            break

        records = parse_articles(html, category_label, url)
        if not records:
            break

        # Enrich with city/state from slug
        tail = city_slug.rsplit("-", 1)
        if len(tail) == 2:
            city_from_slug  = tail[0].replace("-", " ").title()
            state_from_slug = tail[1].upper()
            for r in records:
                if not r["city"]:
                    r["city"] = city_from_slug
                if not r["state_short"]:
                    r["state_short"] = state_from_slug

        all_records.extend(records)

        total_pages = get_total_pages(html)
        log.debug(f"    page {page}/{total_pages}: +{len(records)}")
        if page >= total_pages:
            break
        page += 1

    return all_records


# ── Save ───────────────────────────────────────────────────────────────────────

def save(records):
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(records)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    all_records = []
    seen_bids   = set()  # (bid, category_label)

    for cat_slug, cat_label in CATEGORIES:
        log.info(f"\n{'='*60}")
        log.info(f"Category: {cat_label} ({cat_slug})")
        log.info(f"{'='*60}")

        # ── Discover cities ──────────────────────────────────────────
        city_slugs = set()

        # 1. From the category landing page (cityAutocomplete + anchor hrefs)
        cat_html = fetch(f"{BASE_URL}/{cat_slug}")
        if cat_html:
            found = extract_city_slugs_from_html(cat_html, cat_slug)
            log.info(f"  Category page cities: {len(found)}")
            city_slugs |= found

        # 2. From all 50 state pages
        for state_slug in US_STATE_SLUGS:
            found = collect_cities_from_state(cat_slug, state_slug)
            if found:
                log.info(f"  {state_slug}: {len(found)} cities")
            city_slugs |= found

        log.info(f"  Total unique cities for {cat_label}: {len(city_slugs)}")

        if not city_slugs:
            log.error(f"  No cities found, skipping category.")
            continue

        # ── Scrape each city ─────────────────────────────────────────
        city_slugs = sorted(city_slugs)
        for ci, city_slug in enumerate(city_slugs):
            log.info(f"  [{ci+1}/{len(city_slugs)}] {city_slug}")
            try:
                city_records = scrape_city(cat_slug, cat_label, city_slug)
                new = 0
                for rec in city_records:
                    key = (rec["bid"], cat_label) if rec["bid"] else None
                    if key and key in seen_bids:
                        continue
                    if key:
                        seen_bids.add(key)
                    all_records.append(rec)
                    new += 1
                log.info(f"    +{new} clinics (total: {len(all_records)})")
            except Exception as e:
                log.warning(f"    Error scraping {city_slug}: {e}")

            # Checkpoint every 25 cities
            if (ci + 1) % 25 == 0:
                save(all_records)
                log.info(f"  Checkpoint: {len(all_records)} records saved")

        save(all_records)

    save(all_records)
    log.info(f"\nDone. {len(all_records)} records → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
