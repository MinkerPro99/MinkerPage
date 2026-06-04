// Keep your calendar routes mount intact:
app.use('/api', calendarRoutes);

// --- DEFINE THE MAIN IGNITION SEQUENCE ---
// FIXED: Manually injected the '/api' base path so Express hooks the browser traffic
app.post('/api/ignite-setup', async (req, res) => {
    try {
        console.log("🚀 Jarvis Protocol: Executing triple-threat macro chain...");

        // 1. Smash the Main Power Strip ON
        console.log("⚡ Triggering Scene: Power ON");
        await axios.post('https://api.switch-bot.com/v1.1/scenes/a889c015-31f0-4027-ba1c-68ace7b07402/execute', {}, { 
            headers: getSwitchBotHeaders() 
        });

        // 2-second delay.
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 2. Click the PC Power button mechanical Bot
        console.log("🖥️ Triggering Scene: PC Trigger");
        await axios.post('https://api.switch-bot.com/v1.1/scenes/2dc358cb-6fc3-43b5-9d1e-a670917e9f8b/execute', {}, { 
            headers: getSwitchBotHeaders() 
        });

        res.json({ success: true, message: "Jarvis setup fully ignited! Go secure the match, Bro." });
    } catch (error) {
        console.error("❌ Node runtime choked on webhook:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "SwitchBot global cluster griefed our packets." });
    }
});

// --- BONUS ENDPOINT: THE SHUTDOWN PROTOCOL ---
// FIXED: Added the missing '/api' string here too
app.post('/api/kill-setup', async (req, res) => {
    try {
        console.log("🛑 Jarvis Protocol: Initiating blackout routine...");
        await axios.post('https://api.switch-bot.com/v1.1/scenes/7b615cd9-ba6c-4938-9221-f1f9f5357935/execute', {}, { 
            headers: getSwitchBotHeaders() 
        });
        res.json({ success: true, message: "Battlestation powered down cleanly." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});