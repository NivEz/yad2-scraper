# Yad 2 Smart Scraper

Scrapes and notifies on new Yad2 items with a minimal setup.

---

Struggling to find a high demand product in Yad2? No problem!
The scraper will scan Yad2 and will find for you the relevant items. Once a new item has been uploaded, it will notify you with a Telegram message.

The scraper will be executed approximately once in every 15 minutes (between 08:00-21:00). The cronjob is handled by Github actions - so it is not guaranteed to be executed.

When new items are uploaded, the next Github actions run will push the items to a `json` file under `data` directory (it will be created automatically when needed) - so remember to `git pull` if you want to add scraping targets.

---

> **Note (2025+):** Yad2 now sits behind Radware Bot Manager and renders its
> listings client-side (Next.js). A plain `fetch()` only receives the bot
> challenge, and the old `.feeditem .pic` markup no longer exists — so the
> original `scraper.js` returns nothing. `scraper.py` replaces it: it drives a
> stealth browser ([Camoufox](https://github.com/daijro/camoufox)) that clears
> the challenge, then keys off each listing's stable `/item/<id>` link instead
> of image URLs.
>
> ⚠️ Radware also blocks most datacenter IPs, so a GitHub Actions run may still
> be challenged even via Camoufox. For reliable results run it from a
> residential IP (a local/self-hosted cron) or plug in a maintained third-party
> Yad2 API.

---

### Setup:

To start using the scraper simply:
1. Clone / fork the repository.
2. Install dependencies and fetch the browser: `pip install -r requirements.txt && python -m camoufox fetch`.
3. Set up a Telegram bot.
4. Add the telegram api token and chat ID. You can do it or in the `config.json` file, or in the Github secrets (more secure - recommended) `API_TOKEN` and `CHAT_ID` secrets.
5. Add a `topic` in the `config.json` - name for the scraping topic.
6. Add a `url` in the `config.json` - Yad2 url to scrape - the scraper does not support pagination so be specific and use Yad2 filters for better results.
7. Run locally with `python scraper.py`, or push and wait for the workflow to run.

If you want to disable a scraping topic, you can add a `"disabled": true` field in the `config.json` under a project in the projects list:
```
"projects": [
    {
      "topic": "...",
      "url": "...",
      "disabled": true
    }
  ]
```