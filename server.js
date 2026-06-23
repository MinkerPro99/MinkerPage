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

const pendingPcCommands = [];
const pcCommandResults = new Map();

let alexaRemote = null;
let alexaInitPromise = null;
let alexaRefreshTimer = null;

function requireJarvisCommandAuth(req, res, next) {
    const expected = process.env.JARVIS_COMMAND_TOKEN;
    if (!expected) {
        res.status(500).json({ success: false, error: 'JARVIS_COMMAND_TOKEN is not configured' });
        return;
    }

    const provided = req.get('X-Jarvis-Token') || req.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (provided !== expected) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
    }

    next();
}

function queuePcCommand(text, source = 'api') {
    const command = {
        id: crypto.randomUUID(),
        text,
        source,
        createdAt: new Date().toISOString()
    };
    pendingPcCommands.push(command);
    pcCommandResults.set(command.id, { status: 'queued', command });
    console.log(`[Jarvis Command] Queued ${command.id} from ${source}: ${text}`);
    return command;
}

function alexaEnabled() {
    return process.env.ALEXA_ENABLED === 'true';
}

function getAlexaAuthPath() {
    return process.env.ALEXA_AUTH_FILE || path.join(__dirname, 'alexa-auth.json');
}

function readAlexaAuthData() {
    const authPath = getAlexaAuthPath();
    if (!fs.existsSync(authPath)) return null;
    return JSON.parse(fs.readFileSync(authPath, 'utf8'));
}

function writeAlexaAuthData(authData) {
    if (!authData) return;
    const authPath = getAlexaAuthPath();
    const data = {
        ...authData,
        _jarvisSavedAt: new Date().toISOString()
    };
    fs.writeFileSync(authPath, JSON.stringify(data, null, 2));
}

function resetAlexaSession() {
    alexaRemote = null;
    alexaInitPromise = null;
}

function isAlexaAuthError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('cookie') || message.includes('csrf') || message.includes('renew') || message.includes('unauthorized');
}

function normalizeAlexaError(error) {
    const message = String(error?.message || error || '');
    if (
        message.includes('Please open http://') ||
        message.toLowerCase().includes('cookie invalid') ||
        message.toLowerCase().includes('renew unsuccessful')
    ) {
        return new Error('Alexa auth expired. Renew alexa-auth.json with scripts/alexa-auth.js, then restart PM2.');
    }
    return error;
}

function getAlexaRefreshIntervalMs() {
    const hours = Number(process.env.ALEXA_REFRESH_INTERVAL_HOURS || 12);
    return Math.max(1, hours) * 60 * 60 * 1000;
}

function scheduleAlexaRefresh() {
    if (!alexaEnabled() || alexaRefreshTimer) return;

    alexaRefreshTimer = setInterval(async () => {
        try {
            console.log('[Alexa] Refreshing Echo auth session.');
            resetAlexaSession();
            await initAlexa();
        } catch (error) {
            console.error('[Alexa] Scheduled refresh failed:', error.message);
        }
    }, getAlexaRefreshIntervalMs());

    if (typeof alexaRefreshTimer.unref === 'function') {
        alexaRefreshTimer.unref();
    }
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

        const authData = readAlexaAuthData();

        const remote = new AlexaRemote();
        remote.on('cookie', () => {
            if (remote.cookieData) {
                writeAlexaAuthData(remote.cookieData);
                console.log('[Alexa] Refreshed auth data saved.');
            }
        });

        remote.init({
            cookie: authData || process.env.ALEXA_COOKIE,
            formerRegistrationData: authData || undefined,
            amazonPage: process.env.ALEXA_AMAZON_PAGE || 'amazon.de',
            acceptLanguage: process.env.ALEXA_ACCEPT_LANGUAGE || 'en-GB',
            setupProxy: false,
            proxyOwnIp: process.env.ALEXA_PROXY_IP || 'localhost',
            proxyPort: Number(process.env.ALEXA_PROXY_PORT || 3456),
            proxyListenBind: '127.0.0.1',
            cookieRefreshInterval: Number(process.env.ALEXA_COOKIE_REFRESH_INTERVAL_DAYS || 1),
            useWsMqtt: true
        }, (error) => {
            if (error) {
                alexaInitPromise = null;
                reject(normalizeAlexaError(error));
                return;
            }
            alexaRemote = remote;
            scheduleAlexaRefresh();
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

    const chunks = splitAlexaSpeech(text);
    console.log(`[Alexa] Speaking ${chunks.length} chunk(s).`);

    try {
        await speakAlexaChunks(remote, device, chunks);
    } catch (error) {
        if (!isAlexaAuthError(error)) throw error;

        console.warn('[Alexa] Auth error while speaking; refreshing session and retrying once.');
        resetAlexaSession();
        const refreshedRemote = await initAlexa().catch((refreshError) => {
            throw normalizeAlexaError(refreshError);
        });
        await speakAlexaChunks(refreshedRemote, device, chunks);
    }

    return { skipped: false };
}

async function speakAlexaChunks(remote, device, chunks) {
    for (const [index, chunk] of chunks.entries()) {
        await new Promise((resolve, reject) => {
            remote.sendSequenceCommand(device, 'speak', chunk, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });

        if (index < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, estimateAlexaSpeechMs(chunk)));
        }
    }
}

function splitAlexaSpeech(text, maxLength = 248) {
    const clean = text.replace(/\s+/g, ' ').trim();
    const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
        const part = sentence.trim();
        if (!part) continue;

        if ((current + ' ' + part).trim().length <= maxLength) {
            current = (current + ' ' + part).trim();
            continue;
        }

        if (current) chunks.push(current);

        if (part.length <= maxLength) {
            current = part;
            continue;
        }

        const words = part.split(/\s+/);
        current = '';
        for (const word of words) {
            if ((current + ' ' + word).trim().length > maxLength) {
                if (current) chunks.push(current);
                current = word;
            } else {
                current = (current + ' ' + word).trim();
            }
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

function estimateAlexaSpeechMs(text) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const estimated = (words / 2.7) * 1000;
    return Math.max(1800, Math.min(9000, Math.round(estimated + 650)));
}

async function announceJarvis(authorization) {
    const script = await getJarvisScript(authorization);
    await speakOnAlexa(script);
    return script;
}

app.post('/api/ignite-setup/command', requireJarvisCommandAuth, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
        res.status(400).json({ success: false, error: 'Missing command text' });
        return;
    }

    const command = queuePcCommand(text, 'api');
    res.json({ success: true, commandId: command.id });
});

app.get('/api/ignite-setup/agent/poll', requireJarvisCommandAuth, async (req, res) => {
    const command = pendingPcCommands.shift() || null;
    res.json({ success: true, command });
});

app.post('/api/ignite-setup/agent/result', requireJarvisCommandAuth, async (req, res) => {
    const commandId = String(req.body?.commandId || '').trim();
    if (!commandId) {
        res.status(400).json({ success: false, error: 'Missing commandId' });
        return;
    }

    pcCommandResults.set(commandId, {
        status: req.body?.ok ? 'complete' : 'failed',
        result: req.body,
        updatedAt: new Date().toISOString()
    });
    console.log(`[Jarvis Command] Result ${commandId}: ${req.body?.ok ? 'ok' : 'failed'}`);
    res.json({ success: true });
});

app.get('/api/ignite-setup/command/:id', requireJarvisCommandAuth, async (req, res) => {
    const result = pcCommandResults.get(req.params.id);
    if (!result) {
        res.status(404).json({ success: false, error: 'Unknown command id' });
        return;
    }
    res.json({ success: true, ...result });
});

app.post('/api/ignite-setup/alexa-skill', async (req, res) => {
    const expectedToken = process.env.ALEXA_SKILL_TOKEN;
    if (expectedToken && req.query.token !== expectedToken) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }

    const expectedSkillId = process.env.ALEXA_SKILL_ID;
    const actualSkillId = req.body?.session?.application?.applicationId || req.body?.context?.System?.application?.applicationId;
    if (expectedSkillId && actualSkillId !== expectedSkillId) {
        res.status(401).json(alexaResponse('This Jarvis endpoint is not configured for that skill.'));
        return;
    }

    const requestType = req.body?.request?.type;
    if (requestType === 'LaunchRequest') {
        res.json(alexaResponse('Jarvis online. What shall I do?', false));
        return;
    }

    if (requestType === 'IntentRequest') {
        const intent = req.body?.request?.intent;
        const intentName = intent?.name;

        if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
            res.json(alexaResponse('Very good, sir.'));
            return;
        }

        if (intentName === 'AMAZON.HelpIntent') {
            res.json(alexaResponse('You can ask me to open apps, visit websites, search YouTube, or sort configured folders.'));
            return;
        }

        const commandText = extractAlexaCommand(intent);
        if (!commandText) {
            res.json(alexaResponse('I did not catch the command, sir. Please try again.', false));
            return;
        }

        const command = queuePcCommand(commandText, 'alexa');
        res.json(alexaResponse(`Understood. I have sent that to your PC. Command ${command.id.slice(0, 8)} is queued.`));
        return;
    }

    if (requestType === 'SessionEndedRequest') {
        res.json({});
        return;
    }

    res.json(alexaResponse('Jarvis received an unsupported Alexa request.'));
});

function extractAlexaCommand(intent) {
    const slots = intent?.slots || {};
    const slotNames = ['command', 'Command', 'task', 'Task', 'query', 'Query'];
    for (const name of slotNames) {
        const value = slots[name]?.value;
        if (value && String(value).trim()) return String(value).trim();
    }
    return '';
}

function alexaResponse(text, shouldEndSession = true) {
    return {
        version: '1.0',
        response: {
            outputSpeech: {
                type: 'PlainText',
                text
            },
            reprompt: {
                outputSpeech: {
                    type: 'PlainText',
                    text: 'What shall I do?'
                }
            },
            shouldEndSession
        }
    };
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
