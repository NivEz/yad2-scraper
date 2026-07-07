#!/usr/bin/env python3
"""Yad2 scraper (Camoufox edition).

Yad2 is now behind Radware Bot Manager and renders listings client-side as a
Next.js SPA, so the original bare-fetch + `.feeditem .pic` approach returns
nothing. This drives a stealth Firefox (Camoufox) that clears the challenge,
then keys off each listing's stable item id (from its `/item/<id>` link)
instead of image URLs.

Config lives in config.json (same shape as before):
  { "telegramApiToken": null, "chatId": null,
    "projects": [{ "topic": "...", "url": "...", "disabled": false }] }
API_TOKEN / CHAT_ID env vars override the config values.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

from camoufox.sync_api import Camoufox

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ITEM_ID_RE = re.compile(r"/item/([a-z0-9]+)", re.I)


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def send_telegram(token, chat_id, text):
    if not token or not chat_id:
        print("[telegram skipped — no token/chatId]\n" + text)
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=20) as r:
            r.read()
    except Exception as e:  # noqa: BLE001
        print(f"Telegram send failed: {e}")


def scrape_items(page, url):
    """Return {item_id: text} for the listings on the page."""
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    for _ in range(15):
        time.sleep(2)
        if not page.evaluate("() => !!document.body"):
            continue
        title = page.title()
        if title == "Radware Page":
            continue  # challenge not cleared yet
        rows = page.evaluate(
            r"""() => Array.from(document.querySelectorAll('a[href*="/item/"]'))
                   .map(el => ({
                       href: el.getAttribute('href') || '',
                       text: (el.innerText || '').replace(/\n+/g, ' | ').trim()
                   }))
                   .filter(r => r.text.length > 10)"""
        )
        if rows:
            items = {}
            for r in rows:
                m = ITEM_ID_RE.search(r["href"])
                if m:
                    items.setdefault(m.group(1), r["text"][:220])
            if items:
                return items
    raise RuntimeError("Could not extract listings (Radware challenge or markup change)")


def check_new_items(topic, items):
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{topic}.json")
    try:
        with open(path, encoding="utf-8") as f:
            saved = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        saved = []
    saved_set = set(saved)
    current = list(items.keys())
    new_ids = [i for i in current if i not in saved_set]
    # keep only ids still live + the new ones (mirrors original pruning)
    updated = [i for i in saved if i in items] + new_ids
    if new_ids or updated != saved:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(updated, f, ensure_ascii=False, indent=2)
        with open(os.path.join(os.path.dirname(__file__), "push_me"), "w") as f:
            f.write("")
    return new_ids


def scrape(page, topic, url, token, chat_id):
    send_telegram(token, chat_id, f"Starting scanning {topic} on link:\n{url}")
    try:
        items = scrape_items(page, url)
        new_ids = check_new_items(topic, items)
        if new_ids:
            lines = [f"{items[i]}\nhttps://www.yad2.co.il/item/{i}" for i in new_ids]
            msg = f"{len(new_ids)} new items:\n" + "\n----------\n".join(lines)
            send_telegram(token, chat_id, msg)
        else:
            send_telegram(token, chat_id, "No new items were added")
    except Exception as e:  # noqa: BLE001
        send_telegram(token, chat_id, f"Scan workflow failed... 😥\nError: {e}")
        raise


def main():
    config = load_config()
    token = os.environ.get("API_TOKEN") or config.get("telegramApiToken")
    chat_id = os.environ.get("CHAT_ID") or config.get("chatId")
    projects = [p for p in config.get("projects", []) if not p.get("disabled")]
    for p in config.get("projects", []):
        if p.get("disabled"):
            print(f'Topic "{p.get("topic")}" is disabled. Skipping.')
    if not projects:
        print("No enabled projects in config.json")
        return
    with Camoufox(headless=True, window=(1400, 1000)) as browser:
        page = browser.new_page()
        for p in projects:
            scrape(page, p["topic"], p["url"], token, chat_id)


if __name__ == "__main__":
    main()
