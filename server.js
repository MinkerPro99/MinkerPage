// Make sure this exact path matches what the frontend is calling!
app.post('/api/ignite-setup', async (req, res) => {
    try {
        const targetUrl = `https://api.switch-bot.com/v1.1/devices/${process.env.BOT_POWER_ID}/commands`;
        
        await axios.post(targetUrl, {
            "command": "press",
            "parameter": "default",
            "commandType": "command"
        }, { headers: getHeaders() }); // getHeaders() handles the crypto signature

        res.json({ success: true, message: "PC Ignite command sent to cloud!" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});