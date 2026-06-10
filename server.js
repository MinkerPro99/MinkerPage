const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (!process.env[key.trim()]) {
            process.env[key.trim()] = valueParts.join('=').trim();
        }
    }
}

const TOKEN = '0a665f19682fd91fe341eb35c417271d7b5bc403aa8f949a595f6961be1784cbc7edbae42dfd0598e9b3f5910730ed8f';
const SECRET = '843318da1ae3d2d7663c5a5253a8f249';

function getSwitchBotHeaders() {
    const t = Date.now().toString();
    const nonce = crypto.randomUUID();
    const sign = crypto.createHmac('sha256', SECRET).update(TOKEN + t + nonce).digest('base64');
    return { Authorization: TOKEN, sign, t, nonce, 'Content-Type': 'application/json' };
}

const app = express();
app.use(express.json());

let alexaRemote = null;
let alexaInitPromise = null;

function alexaEnabled() {
    return process.env.ALEXA_ENABLED === 'true';
}

function initAlexa() {
    if (!alexaEnabled()) return Promise.resolve(null);
    if (alexaRemote) return Promise.resolve(alexaRemote);
    if (alexaInitPromise) return alexaInitPromise;

    alexaInitPromise = new Promise((resolve, reject) => {
        let AlexaRemote;
        try {
            AlexaRemote = require('alexa-remote2');
        } catch (error) {
            reject(new Error('alexa-remote2 is not installed'));
            return;
        }

        const remote = new AlexaRemote();
        remote.init({
            cookie: process.env.ALEXA_COOKIE,
            refreshToken: process.env.ALEXA_REFRESH_TOKEN,
            amazonPage: process.env.ALEXA_AMAZON_PAGE || 'amazon.de',
            acceptLanguage: process.env.ALEXA_ACCEPT_LANGUAGE || 'de-DE',
            useWsMqtt: true
        }, (error) => {
            if (error) {
                alexaInitPromise = null;
                reject(error);
                return;
            }
            alexaRemote = remote;
            resolve(remote);
        });
    });

    return alexaInitPromise;
}

async function getJarvisScript(authorization) {
    if (!authorization) {
        throw new Error('Missing calendar authorization token');
    }

    const response = await axios.get('http://127.0.0.1:5050/api/jarvis/script', {
        headers: { Authorization: authorization },
        timeout: 25000
    });

    if (!response.data?.script) {
        throw new Error('Jarvis script endpoint returned no script');
    }

    return response.data.script;
}

async function speakOnAlexa(text) {
    const remote = await initAlexa();
    if (!remote) {
        console.log('[Alexa] Disabled; skipping Echo announcement.');
        return { skipped: true };
    }

    const device = process.env.ALEXA_DEVICE_NAME;
    if (!device) {
        throw new Error('ALEXA_DEVICE_NAME is not configured');
    }

    await new Promise((resolve, reject) => {
        remote.sendCommand(device, 'speak', text, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });

    return { skipped: false };
}

async function announceJarvis(authorization) {
    const script = await getJarvisScript(authorization);
    await speakOnAlexa(script);
    return script;
}

app.post('/api/ignite-setup/jarvis-test', async (req, res) => {
    try {
        const script = await announceJarvis(req.headers.authorization);
        res.json({ success: true, script });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

app.post('/api/ignite-setup', async (req, res) => {
    try {
        await axios.post('https://api.switch-bot.com/v1.1/scenes/a889c015-31f0-4027-ba1c-68ace7b07402/execute', {}, { headers: getSwitchBotHeaders() });
        await new Promise(r => setTimeout(r, 2000));
        await axios.post('https://api.switch-bot.com/v1.1/scenes/2dc358cb-6fc3-43b5-9d1e-a670917e9f8b/execute', {}, { headers: getSwitchBotHeaders() });

        try {
            await announceJarvis(req.headers.authorization);
        } catch (error) {
            console.error('[Jarvis/Alexa] Announcement failed:', error.message);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

app.post('/api/kill-setup', async (req, res) => {
    try {
        await axios.post('https://api.switch-bot.com/v1.1/scenes/7b615cd9-ba6c-4938-9221-f1f9f5357935/execute', {}, { headers: getSwitchBotHeaders() });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));
