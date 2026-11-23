const { TwitchNotificationBot } = require("./TwitchNotificationBot");
const { AppConfig } = require("./config/AppConfig");
const appConfig = new AppConfig();
appConfig.load();
const app = new TwitchNotificationBot(appConfig);
app.Start();