const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

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

app.post('/api/ignite-setup', async (req, res) => {
    try {
        await axios.post('https://api.switch-bot.com/v1.1/scenes/a889c015-31f0-4027-ba1c-68ace7b07402/execute', {}, { headers: getSwitchBotHeaders() });
        await new Promise(r => setTimeout(r, 2000));
        await axios.post('https://api.switch-bot.com/v1.1/scenes/2dc358cb-6fc3-43b5-9d1e-a670917e9f8b/execute', {}, { headers: getSwitchBotHeaders() });
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