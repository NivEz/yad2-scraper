# Yad 2 Smart Scraper

Scrapes and notifies on new Yad2 items with a minimal setup.

---

Struggling to find a high demand product in Yad2? No problem!
The scraper will scan Yad2 and will find for you the relevant items. Once a new item has been uploaded, it will notify you with a Telegram message.

The scraper will be executed approximately once in every 15 minutes (between 08:00-21:00). The cronjob is handled by Github actions - so it is not guaranteed to be executed.

When new items are uploaded, the next Github actions run will push the items to a `json` file under `data` directory (it will be created automatically when needed) - so remember to `git pull` if you want to add scraping targets.

---

### Setup:

To start using the scraper simply:
1. Clone / fork the repository.
2. Set up a Telegram bot.
3. Add the telegram api token and chat ID. You can do it or in the `config.json` file, or in the Github secrets (more secure - recommended) `API_TOKEN` and `CHAT_ID` secrets.
4. Add a `topic` in the `config.json` - name for the scraping topic.
5. Add a `url` in the `config.json` - Yad2 url to scrape - the scraper does not support pagination so be specific and use Yad2 filters for better results. 
6. Push and wait for the workflow to run.

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