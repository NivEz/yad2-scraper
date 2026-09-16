const cheerio = require('cheerio');
const Telenode = require('telenode-js');
const fs = require('fs');
const config = require('./config.json');

const sendToRailwayAPI = async (imgUrl, topic, pageUrl) => {
    const apiUrl = process.env.API_URL;
    const apiKey = process.env.API_KEY;

    if (!apiUrl || !apiKey) {
        console.log("API_URL or API_KEY missing in environment variables. Skipping Railway API push.");
        return;
    }

    const payload = {
        yad2_url: pageUrl,
        title: topic, // משתמשים בשם הנושא מההגדרות ככותרת
        price: 0,     // Claude בשרת שלכם ינסה לחלץ את המחיר והמפרט לבד
        description: `Scraped from image URL: ${imgUrl}`,
        city: ""
    };

    try {
        const res = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": apiKey
            },
            body: JSON.stringify(payload)
        });
        console.log(`Sent item to Railway API, status: ${res.status}`);
    } catch (err) {
        console.error("Failed sending item to Railway API:", err);
    }
};

const getYad2Response = async (targetUrl) => {
    const apiKey = process.env.SCRAPER_API_KEY || process.env.ZENROWS_API_KEY;

    if (!apiKey) {
        console.error("⚠️ API Key is missing! Check your GitHub Secrets configuration.");
        return null;
    }

    console.log(`Loaded API Key successfully (length: ${apiKey.length} chars)`);

    // הוספת premium_proxy=true ו-js_render=true לעקיפת Radware ב-Yad2
    const proxyUrl = `https://api.zenrows.com/v1/?url=${encodeURIComponent(targetUrl)}&js_render=true&premium_proxy=true`;

    try {
        console.log("Fetching Yad2 page via ZenRows Anti-Bot + Premium Proxy...");
        const res = await fetch(proxyUrl, {
            headers: {
                "X-API-KEY": apiKey.trim()
            }
        });

        if (!res.ok) {
            console.error(`ZenRows returned status: ${res.status}`);
            const errText = await res.text();
            console.error("Response details:", errText.substring(0, 300));
            return null;
        }

        return await res.text();
    } catch (err) {
        console.error("Fetch error via ZenRows:", err.message);
        return null;
    }
};

const scrapeItemsAndExtractImgUrls = async (url) => {
    const yad2Html = await getYad2Response(url);
    if (!yad2Html) {
        console.warn("⚠️ Could not get Yad2 response (Empty HTML)");
        return [];
    }

    const $ = cheerio.load(yad2Html);
    const titleText = $("title").first().text().trim();
    console.log(`Page title received from Yad2: "${titleText}"`);

    const imageUrls = [];

    // סריקה לפי הסלקטורים המעודכנים של יד2 (תמיכה במבנה ה-React החדש והישן)
    $('[data-testid="feed-item"], .feeditem, [class*="feed_item"], [class*="feedItem"]').each((_, item) => {
        const $item = $(item);
        
        // חיפוש תמונות בתוך המודעה
        const imgSrc = $item.find('img[src*="yad2"], img[src*="y2"]').attr('src') || 
                       $item.find('img').attr('src');

        if (imgSrc && !imgSrc.includes('placeholder') && !imgSrc.includes('avatar')) {
            imageUrls.push(imgSrc);
        }
    });

    console.log(`Found ${imageUrls.length} valid item pictures on page.`);
    return imageUrls;
};

const checkIfHasNewItem = async (imgUrls, topic) => {
    const filePath = `./data/${topic}.json`;
    let savedUrls = [];
    try {
        savedUrls = require(filePath);
    } catch (e) {
        if (e.code === "MODULE_NOT_FOUND") {
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }
            fs.writeFileSync(filePath, '[]');
        } else {
            console.log(e);
            throw new Error(`Could not read / create ${filePath}`);
        }
    }
    let shouldUpdateFile = false;
    savedUrls = savedUrls.filter(savedUrl => {
        shouldUpdateFile = true;
        return imgUrls.includes(savedUrl);
    });
    const newItems = [];
    imgUrls.forEach(url => {
        if (!savedUrls.includes(url)) {
            savedUrls.push(url);
            newItems.push(url);
            shouldUpdateFile = true;
        }
    });
    if (shouldUpdateFile) {
        const updatedUrls = JSON.stringify(savedUrls, null, 2);
        fs.writeFileSync(filePath, updatedUrls);
        await createPushFlagForWorkflow();
    }
    return newItems;
};

const createPushFlagForWorkflow = () => {
    fs.writeFileSync("push_me", "");
};

const scrape = async (topic, url) => {
    const apiToken = process.env.API_TOKEN || config.telegramApiToken;
    const chatId = process.env.CHAT_ID || config.chatId;
    const telenode = new Telenode({ apiToken });
    try {
        console.log(`Starting scan for: ${topic}`);
        const scrapeImgResults = await scrapeItemsAndExtractImgUrls(url);
        const newItems = await checkIfHasNewItem(scrapeImgResults, topic);
        
        if (newItems.length > 0) {
            console.log(`Found ${newItems.length} new items!`);
            
            // לשלוח ל-Telegram במידה והוגדר
            if (apiToken && chatId) {
                const newItemsJoined = newItems.join("\n----------\n");
                const msg = `${newItems.length} new items found for ${topic}:\n${newItemsJoined}`;
                await telenode.sendTextMessage(msg, chatId);
            }

            // *** שליחה אקטיבית ל-Railway API ***
            for (const itemImgUrl of newItems) {
                await sendToRailwayAPI(itemImgUrl, topic, url);
            }

        } else {
            console.log("No new items were added.");
        }
    } catch (e) {
        let errMsg = e?.message || "";
        console.error(`Scan workflow failed for ${topic}:`, errMsg);
        if (apiToken && chatId) {
            await telenode.sendTextMessage(`Scan workflow failed for ${topic}... 😥\n${errMsg}`, chatId);
        }
    }
};

const program = async () => {
    const activeProjects = config.projects.filter(project => !project.disabled);
    for (const project of activeProjects) {
        await scrape(project.topic, project.url);
    }
};

program();
