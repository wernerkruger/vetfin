#!/usr/bin/env python3
"""
Scrape contact emails from clinic websites listed in wowvets_clinics.csv.

Adds an `email` column (blank when none found). Supports resume via checkpoint file.

Usage:
    python wowvets_email_scraper.py              # full run
    python wowvets_email_scraper.py --limit 100  # test batch
"""

import argparse
import csv
import json
import logging
import re
import tempfile
import threading
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

CSV_FILE = Path(__file__).parent / "wowvets_clinics.csv"
CHECKPOINT_FILE = Path(__file__).parent / "wowvets_email_checkpoint.json"

FIELDNAMES = [
    "category", "name", "address", "city", "state", "state_short",
    "phone", "website", "rating", "bid", "source_url", "email",
]

EMAIL_RE = re.compile(
    r"[a-zA-Z0-9][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9][a-zA-Z0-9.\-]*\.[a-zA-Z]{2,}"
)

JUNK_EMAIL_RE = re.compile(
    r"(@|\.)(sentry\.io|wixpress\.com|wix\.com|example\.com|domain\.com|"
    r"email\.com|yourdomain\.com|wordpress\.org|schema\.org|"
    r"googleapis\.com|cloudflare\.com|jquery\.com|bootstrap|"
    r"fontawesome|gravatar\.com|sentry-next|google\.com|"
    r"2x\.png|2x\.webp|\.png|\.jpg|\.svg|\.webp|whiskercloud|"
    r"youremail\.com|latinotype\.com|toxicsinfo\.org|mail\.com$)",
    re.I,
)

JUNK_LOCAL_RE = re.compile(
    r"^(noreply|no-reply|donotreply|mailer-daemon|postmaster|"
    r"webmaster@example|test@|user@|name@|email@|you@)",
    re.I,
)

# Third-party site-builder / platform inboxes (not the clinic's own address)
PLATFORM_EMAIL_DOMAINS = {
    "evetsites.com", "vetsourcecms.com", "myvetstoreonline.com",
    "idexx.com", "covetrus.com", "vetstreet.com",
}

SKIP_DOMAINS = {
    "facebook.com", "m.facebook.com", "fb.com",
    "yelp.com", "google.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com",
    "business.site", "g.page", "maps.google.com",
}

CONTACT_PATHS = ("/contact", "/contact-us", "/contactus", "/about/contact", "/about-us/contact")

_THREAD_LOCAL = threading.local()
_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; VetFinResearch/1.0; "
        "+https://github.com/vetfin/email-research)"
    ),
    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def get_session():
    session = getattr(_THREAD_LOCAL, "session", None)
    if session is None:
        session = requests.Session()
        session.headers.update(_DEFAULT_HEADERS)
        _THREAD_LOCAL.session = session
    return session


WORKERS = 10
REQUEST_TIMEOUT = 10
MAX_PAGE_BYTES = 500_000


def normalize_url(url):
    url = (url or "").strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def site_domain(url):
    try:
        return urlparse(url).netloc.lower().replace("www.", "")
    except Exception:
        return ""


def site_base_domain(domain):
    parts = domain.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return domain


def is_skippable_website(url):
    dom = site_domain(url)
    if not dom:
        return True
    if dom in SKIP_DOMAINS:
        return True
    for skip in SKIP_DOMAINS:
        if dom.endswith("." + skip) or dom == skip:
            return True
    return False


def clean_email(raw):
    e = raw.strip().lower()
    e = e.split("?")[0].split("#")[0]
    if JUNK_EMAIL_RE.search(e) or JUNK_LOCAL_RE.match(e):
        return None
    if not EMAIL_RE.fullmatch(e):
        return None
    if len(e) > 80 or ".." in e:
        return None
    return e


def extract_emails_from_html(html, page_url):
    emails = set()
    if not html:
        return emails

    soup = BeautifulSoup(html[:MAX_PAGE_BYTES], "lxml")

    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("mailto:"):
            addr = href[7:]
            cleaned = clean_email(addr)
            if cleaned:
                emails.add(cleaned)

    visible = soup.get_text(" ", strip=True)
    for match in EMAIL_RE.findall(visible):
        cleaned = clean_email(match)
        if cleaned:
            emails.add(cleaned)

    # Raw HTML sometimes has obfuscated emails in data attributes
    for match in EMAIL_RE.findall(html[:MAX_PAGE_BYTES]):
        cleaned = clean_email(match)
        if cleaned:
            emails.add(cleaned)

    return emails


def rank_email(emails, page_url):
    if not emails:
        return ""
    dom = site_domain(page_url)
    base = site_base_domain(dom)
    preferred_prefixes = (
        "info@", "contact@", "office@", "hello@", "reception@",
        "appointments@", "appt@", "clinic@", "vet@", "mail@",
    )

    def score_value(e):
        s = 0
        email_dom = e.split("@")[-1]
        if base and base in email_dom:
            s -= 20
        if email_dom in PLATFORM_EMAIL_DOMAINS:
            s += 40
        for i, pref in enumerate(preferred_prefixes):
            if e.startswith(pref):
                s -= (10 - i)
        if "support@" in e or "sales@" in e:
            s += 5
        if any(x in e for x in ("noreply", "no-reply", "privacy", "legal", "mediarelations")):
            s += 50
        return s

    def sort_key(e):
        return (score_value(e), len(e), e)

    best = sorted(emails, key=sort_key)[0]
    # If only platform/corporate addresses exist, treat as no clinic email
    if score_value(best) >= 40:
        clinic_matches = [e for e in emails if base and base in e.split("@")[-1]]
        if clinic_matches:
            return sorted(clinic_matches, key=sort_key)[0]
        return ""
    return best


def fetch_html(url):
    try:
        r = get_session().get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if r.status_code >= 400:
            return None, None
        ctype = (r.headers.get("Content-Type") or "").lower()
        if "html" not in ctype and "text" not in ctype:
            return None, r.url
        return r.text, r.url
    except requests.RequestException:
        return None, None


def find_email_for_website(website_url):
    url = normalize_url(website_url)
    if not url or is_skippable_website(url):
        return ""

    all_emails = set()
    html, final_url = fetch_html(url)
    if html and final_url:
        all_emails |= extract_emails_from_html(html, final_url)

    if not all_emails and html:
        for path in CONTACT_PATHS:
            contact_url = urljoin(final_url, path)
            if site_domain(contact_url) != site_domain(final_url):
                continue
            chtml, _ = fetch_html(contact_url)
            if chtml:
                found = extract_emails_from_html(chtml, contact_url)
                all_emails |= found
                if found:
                    break
            time.sleep(0.15)

    return rank_email(all_emails, final_url or url)


def row_key(row):
    return row.get("bid") or f"{row.get('name','')}|{row.get('phone','')}|{row.get('website','')}"


def load_checkpoint():
    if CHECKPOINT_FILE.exists():
        with open(CHECKPOINT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_checkpoint(data):
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=CHECKPOINT_FILE.parent, delete=False,
    ) as tmp:
        json.dump(data, tmp, separators=(",", ":"))
        tmp_path = tmp.name
    Path(tmp_path).replace(CHECKPOINT_FILE)


def scrape_email_for_row(row):
    """Network work only — checkpoint updates happen on the main thread."""
    key = row_key(row)
    website = row.get("website", "").strip()
    if not website:
        return key, "", True
    return key, find_email_for_website(website), True


def write_csv(rows):
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max new websites to scrape")
    parser.add_argument("--workers", type=int, default=WORKERS)
    args = parser.parse_args()

    with open(CSV_FILE, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for row in rows:
        row.setdefault("email", "")

    checkpoint = load_checkpoint()
    log.info("Loaded %d rows, checkpoint has %d entries", len(rows), len(checkpoint))

    # Rows that need scraping
    todo_indices = []
    for i, row in enumerate(rows):
        key = row_key(row)
        if key in checkpoint:
            row["email"] = checkpoint[key]
            continue
        if row.get("website", "").strip() and not is_skippable_website(
            normalize_url(row["website"]) or ""
        ):
            todo_indices.append(i)

    if args.limit:
        todo_indices = todo_indices[: args.limit]

    log.info("Need to scrape %d websites", len(todo_indices))

    if not todo_indices:
        write_csv(rows)
        log.info("Nothing to do. CSV updated with checkpoint data.")
        return

    scraped = 0
    found = 0
    checkpoint_every = 50

    def task(idx):
        return idx, scrape_email_for_row(rows[idx])

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(task, i): i for i in todo_indices}
        for n, future in enumerate(as_completed(futures), 1):
            idx = futures[future]
            try:
                idx, (key, email, updated) = future.result()
                rows[idx]["email"] = email
                checkpoint[key] = email
                if updated:
                    scraped += 1
                    if email:
                        found += 1
            except Exception as e:
                log.warning("Row %d failed: %s", idx, e)
                key = row_key(rows[idx])
                rows[idx]["email"] = ""
                checkpoint[key] = ""

            if n % checkpoint_every == 0:
                save_checkpoint(checkpoint)
                write_csv(rows)
                log.info(
                    "Progress %d/%d | scraped=%d emails_found=%d",
                    n, len(todo_indices), scraped, found,
                )

    save_checkpoint(checkpoint)
    write_csv(rows)

    total_with_email = sum(1 for r in rows if r.get("email"))
    log.info(
        "Done. Scraped %d sites, found %d new emails. Total rows with email: %d",
        scraped, found, total_with_email,
    )


if __name__ == "__main__":
    main()
