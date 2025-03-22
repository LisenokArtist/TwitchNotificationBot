const TwitchNotificationBot = require("./TwitchNotificationBot");
const { AppConfig } = require("./Core/AppConfig");
const appConfig = new AppConfig();
appConfig.load();
const app = new TwitchNotificationBot(appConfig);
app.setParentToServices();
app.Start();