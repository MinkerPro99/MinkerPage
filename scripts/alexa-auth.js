const fs = require('fs');
const path = require('path');
const alexaCookie = require('alexa-cookie2');

const authPath = process.env.ALEXA_AUTH_FILE || path.join(__dirname, '..', 'alexa-auth.json');
const proxyOwnIp = process.env.ALEXA_PROXY_IP || '192.168.1.72';
const proxyPort = Number(process.env.ALEXA_PROXY_PORT || 3456);

let formerRegistrationData;
if (fs.existsSync(authPath)) {
    formerRegistrationData = JSON.parse(fs.readFileSync(authPath, 'utf8'));
}

const config = {
    logger: console.log,
    proxyOwnIp,
    proxyOnly: true,
    setupProxy: true,
    proxyPort,
    proxyListenBind: '0.0.0.0',
    proxyLogLevel: 'info',
    amazonPage: process.env.ALEXA_AMAZON_PAGE || 'amazon.de',
    acceptLanguage: process.env.ALEXA_ACCEPT_LANGUAGE || 'en-GB',
    baseAmazonPage: process.env.ALEXA_BASE_AMAZON_PAGE || 'amazon.com',
    amazonPageProxyLanguage: process.env.ALEXA_PROXY_LANGUAGE || 'en_GB',
    deviceAppName: process.env.ALEXA_DEVICE_APP_NAME || 'MinkerPage Jarvis',
    formerRegistrationData,
    formerDataStorePath: path.join(__dirname, '..', 'alexa-former-data.json'),
    proxyCloseWindowHTML: '<b>Jarvis Echo authentication complete. You can close this browser tab.</b>'
};

console.log(`Open this URL on your PC: http://${proxyOwnIp}:${proxyPort}`);
console.log(`Writing Alexa auth data to: ${authPath}`);

alexaCookie.generateAlexaCookie(config, (error, result) => {
    if (error) {
        if (String(error.message || error).includes('Please open')) {
            console.log(error.message || error);
            return;
        }
        console.error(error);
        process.exitCode = 1;
        return;
    }

    if (!result) {
        console.log('Waiting for Amazon login to complete...');
        return;
    }

    fs.writeFileSync(authPath, JSON.stringify(result, null, 2));
    console.log('Alexa auth saved.');
    alexaCookie.stopProxyServer();
});
