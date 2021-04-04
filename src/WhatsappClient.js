const path = require('path');
const puppeteer = require('puppeteer');
const axios = require('axios');
const mime = require('mime');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/';
const DEFAULT_CHROMIUM_ARGS = [
    `--app=${WHATSAPP_WEB_URL}`,
    //"--disable-gpu",
    "--renderer",
    "--no-sandbox",
    "--no-service-autorun",
    "--no-experiments",
    "--no-default-browser-check",
    //"--disable-webgl",
    //"--disable-threaded-animation",
    //"--disable-threaded-scrolling",
    //"--disable-in-process-stack-traces",
    //"--disable-histogram-customizer",
    //"--disable-gl-extensions",
    "--disable-extensions",
    //"--disable-composited-antialiasing",
    //"--disable-canvas-aa",
    //"--disable-3d-apis",
    //"--disable-accelerated-2d-canvas",
    //"--disable-accelerated-jpeg-decoding",
    //"--disable-accelerated-mjpeg-decode",
    //"--disable-app-list-dismiss-on-blur",
    //"--disable-accelerated-video-decode",
    //"--num-raster-threads=1",
];

const timeout = ms => new Promise(res => setTimeout(res, ms));

function parse(str) {
    if (!str) return ['', ''];

    let pos = str.indexOf(' ');
    return (pos === -1) ? [str, ''] : [str.substr(0, pos), str.substr(pos + 1)];
};

function join(str1, str2, delim) {
    if (str1.length == 0) {
        return str2;
    }
    else if (str2.length == 0) {
        return str1;
    }
    else {
        return str1 + delim + str2;
    }
}

function inspectMessage(msg) {
    return JSON.stringify(msg, function (key, value) {
        if (key === 'data' && typeof value === 'string' && value.length > 50) {
            return value.substring(0, 50) + '[...]';
        }
        return value;
    });
}

const superbotUrl = process.env.SUPERBOT_URL || 'http://localhost:3000/message';

export default class WhatsappClient {
    
    constructor(options) {
        this.options = options;
    }

    async getWhatsappPage() {
        let pages = await this.browser.pages();
        for (let i = 0; i < pages.length; ++i) {
            await pages[i].close();
        }

        let page = await this.browser.newPage();
        page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36');
        await page.setBypassCSP(true);
        await page.setViewport({
            width: 800,
            height: 900
        })
        await page.goto(WHATSAPP_WEB_URL, {
            waitUntil: 'networkidle0',
            timeout: 0
        });        
        return page;
    }

    async start() {
        console.log(`Launching puppeteer instance in ${(process.env.PUPPETEER_MODE || 'normal')} mode...`);

        this.browser = await puppeteer.launch({
            headless: (process.env.PUPPETEER_MODE || 'normal') === 'headless',
            userDataDir: "./user_data",
            args: DEFAULT_CHROMIUM_ARGS,
            ignoreHTTPSErrors: true,
            devtools: false,
            defaultViewport: null,
            executablePath: (process.env.USE_PUPPETEER_EXE_PATH == 1 && process.env.PUPPETEER_EXE_PATH)
                                ? process.env.PUPPETEER_EXE_PATH : undefined
        });
        
        console.log('Browsing to Whatsapp Web...');

        this.page = await this.getWhatsappPage();

        console.log('Loading WAPI...');

        var filepath = path.join(__dirname, 'web/wapi.js');
        await this.page.addScriptTag({ path: filepath, type: 'text/javascript' });        

        console.log('Checking Whatsapp Web API...');

        while (await this.page.evaluate(() => {
            return !window.WAPI.isReady();
        }))
        {
            console.log('Waiting for Whatsapp Web API...');
            await this.page.evaluate(() => {
                window.WAPI.autoDiscoverModules();
            });
            await timeout(3000);
        }

        console.log('Whatsapp Web API detected.');

        await this.page.evaluate(() => {
            window.WAPI.startListening();
        });

        console.log('Listening for new messages...');

        console.log('Loading hash library...');

        var filepath = path.join(__dirname, 'web/sha256.js');
        await this.page.addScriptTag({ path: filepath, type: 'text/javascript' });

        console.log('Loading super-bot...');

        await this.page.exposeFunction('onMessageReceived', (message) => {
            this.onMessageReceived(message);
        });

        await this.page.exposeFunction('generateMediaKey', () => {
            return crypto.randomBytes(32).toString('base64');
        });

        var filepath = path.join(__dirname, 'web/superbot.js');
        await this.page.addScriptTag({ path: filepath, type: 'text/javascript' });

        console.log('Starting callback server...');

        await this.startCallbackServer();

        console.log('Done!');
    }

    async startCallbackServer() {
        const route = '/api/message';
        const port = process.env.CALLBACK_PORT || 3001;
        const host = process.env.CALLBACK_HOST || 'localhost';
        this.callbackUrl = `http://${host}:${port}${route}`;

        const server = express();
        server.use(express.json({ limit: '20mb' }));

        server.post(route, async (req, res) => {
            try {
                console.log(`Bot Sent: ${inspectMessage(req.body)}`);

                await this.onBotMessageReceived(req.body);
            }
            catch (error) {
                console.log(error);
            }
        });

        server.listen(port, () => {
            console.log(`Listening on ${this.callbackUrl}...`);
        });
    }

    async screenshotDOMElement(opts = {}) {
        const padding = 'padding' in opts ? opts.padding : 0;
        const path = 'path' in opts ? opts.path : null;
        const selector = opts.selector;

        if (!selector)
            throw Error('Please provide a selector.');

        const rect = await this.page.evaluate(selector => {
            const element = document.querySelector(selector);
            if (!element)
                return null;
            const {x, y, width, height} = element.getBoundingClientRect();
            return {left: x, top: y, width, height, id: element.id};
        }, selector);

        if (!rect)
            throw Error(`Could not find element that matches selector: ${selector}.`);

        return await this.page.screenshot({
            path,
            clip: {
                x: rect.left - padding,
                y: rect.top - padding,
                width: rect.width + padding * 2,
                height: rect.height + padding * 2
            }
        });
    }

    async sendSeen(to) {
        await this.page.evaluate(to => {
            WAPI.sendSeen(to);
        }, to);
    }

    async sendMessage(to, message) {
        await this.page.evaluate((to, message) => {
            WAPI.sendMessage2(to, message, (result) => {
                console.log(`Send message ${message} to ${to} result = ${result}`);
            });
        }, to, message);
    }

    getImageFileExtension(image) {
        if (image.type == "sticker" || image.mimeType == 'image/webp') {
            return 'webp';
        } else if (image.type == "video" || image.mimeType == 'video/mp4') {
            return 'mp4';
        } else if (image.type == "ptt") {
            return 'ogg';
        } else {
            return 'jpg';
        }
    }

    getFileInBase64(filename) {
        return new Promise((resolve, reject) => {
            try {
                filename = path.join(process.cwd(), filename);
                const fileMime = mime.getType(filename);
                var file = fs.readFileSync(filename, { encoding: 'base64' });
                resolve(`data:${fileMime};base64,${file}`);
            } catch (error) {
                reject(error);
            }
        });
    }

    async sendScreenshot(to, caption) {
        await this.screenshotDOMElement({
            path: 'screenshot.png',
            selector: '#main',
            padding: 0
        });
        await this.sendImage(to, {
            data: await this.getFileInBase64('screenshot.png'),
            type: 'image',
            mimeType: 'image/png'
        }, caption);
    }

    async sendImage(to, image, caption) {
        if (image.type == "sticker" || image.mimeType == 'image/webp') {
            await this.page.evaluate(async (to, image, caption) => {
                let encrypted = await WAPI.encryptAndUploadFile({
                    type: "sticker", 
                    data: window.WAPI.base64ImageToFile(image.data, "file.webp")
                });

                WAPI.sendSticker({ sticker: encrypted, chatid: to }, async (result) => {
                    console.log(`Send sticker to ${to} result = ${result}`);
                    if (result) {
                        if (caption && caption.length > 0) {
                            const timeout = ms => new Promise(res => setTimeout(res, ms));
                            await timeout(2000);
                            WAPI.sendMessage2(to, caption);
                        }
                    }
                    else {
                        WAPI.sendMessage2(to, 'Error: Sticker could not be sent.');
                    }
                });
            }, to, image, caption);
        }
        else {
            let imageFileName = `test.${this.getImageFileExtension(image)}`;
            await this.page.evaluate((to, image, imageFileName, caption) => {
                WAPI.sendImage(`${image.data}`, to, imageFileName, caption, (result) => {
                    console.log(`Send image to ${to} result = ${result}`);
                });
            }, to, image, imageFileName, caption);
        }
    }

    _qualifyText(message, text) {
        return text.replace('$user', message.sender.id).replace('$quoteUser', message.quotedMsg && message.quotedMsg.senderId);
    }

    async createBotMessage(message) {
        let parsedText = parse(message.text);
        
        let first = parsedText[0].trim();
        let rest = this._qualifyText(message, parsedText[1]);
        let attachment = null;
        let sender = { id : message.sender.id, name : message.sender.name, shortName : message.sender.shortName, isMe : message.sender.isMe };
        let chat = { id : message.chat.id };
        
        let hasTrigger = this.options.triggers.includes(first.substr(0, 1));
        let isDirected = false;
        if (!hasTrigger) {
            isDirected = first.substr(-1) == ":" && this.options.aliases.includes(first.substr(0, first.length - 1));
            if (!isDirected) {
                return;
            }
        }

        if (first == "!moment" || first == "!screenshot") {
            if (first === "!moment" && rest.length == 0) {
                this.sendMessage(message.chat.id, 'Specify a name for the recording.');
                return;
            }
            await this.page.evaluate(async (chatId) => {
                let chat = Store.Chat.get(chatId);
                await Store.UiController.openChatBottom(chat);
            }, message.chat.id);
            await timeout(2000);
            await this.sendScreenshot(message.chat.id, first === "!moment" ? `!record ${rest}` : undefined);
            if (message.text == "!moment") {
                await timeout(2000);
                await this.sendMessage(message.chat.id, 'Moment recorded!');
            }
            return;
        }

        if (message.type == "image" || message.type == "video") {
            attachment = { data : message.body, mimeType : message.mimeType, type : message.type };
        }
        else if (message.quotedMsg) {
            if (message.quotedMsg.type == "chat") {
                rest = join(rest, message.quotedMsg.body, ' ');
            }
            else if (message.quotedMsg.caption) {
                rest = join(rest, message.quotedMsg.caption, ' ');
            }

            if (message.quotedMsg.type == "image" || message.quotedMsg.type == "sticker" || message.quotedMsg.type == "video" || message.quotedMsg.type == "ptt") {
                attachment = { data : message.quotedMsg.body, mimeType : message.quotedMsg.mimeType, type : message.quotedMsg.type };
                if (message.quotedMsg.type == "sticker") {
                    attachment.url = message.quotedMsg.url;
                    attachment.mediaKey = message.quotedMsg.mediaKey;
                    attachment.filehash = message.quotedMsg.filehash;
                    attachment.uploadhash = message.quotedMsg.uploadhash;
                }
            }
        }

        if (first.length > 0) {
            if (hasTrigger) {
                return { text : join(first.substr(1), rest, ' '), sender, chat, attachment };
            }
            else if (isDirected) {
                return { text : join('natural', rest, ' '), sender, chat };
            }
        }

        return null;
    }

    async onBotMessageReceived(message) {
        let text = message.text || '';
        if (message.error) {
            text = "Error: " + text;
        }
        
        if (message.attachments && message.attachments.length > 0 && !message.attachment) {
            message.attachment = message.attachments[0];
        }

        if (message.attachment) {                        
            if (message.addressee) {
                text = `${message.addressee}: ` + text + '☝☝';
            }
            await this.sendImage(message.chat.id, 
                message.attachment,
                text);
        }
        else {
            if (message.addressee) {
                text = `${message.addressee}: ` + text;
            }
            await this.sendMessage(message.chat.id, text);
        }
    }

    async onMessageReceived(message) {
        console.log(`Message from ${message.sender.name}: ${message.text}`);
        
        try {
            let botMessage = await this.createBotMessage(message);
            if (botMessage) {
                botMessage.callbackUrl = this.callbackUrl;

                console.log(`Sending to bot: ${inspectMessage(botMessage)}`);
                let response = await axios.post(superbotUrl, botMessage);
                
                if (response.status == 200) {
                    console.log(`Received back: ${inspectMessage(response.data)}`);
                    let data = response.data;
                    if (!data.chat || !data.chat.id) {
                        data.chat = { id: message.chat.id };
                    }

                    await this.onBotMessageReceived(data);
                }
                else {
                    console.log(`Could not contact bot.`);
                    this.sendMessage(message.chat.id, 'Error: could not contact bot.');
                }
            }
        }
        catch(error) {
            console.log(`Error when contacting bot: ${error}`, error.stack);
            this.sendMessage(message.chat.id, 'Error: could not contact bot.');
        }
    }
}