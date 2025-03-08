const TwitchNotificationBot = require("./TwitchNotificationBot");
const { AppConfig, DiscordConfig } = require("./Core/AppConfig");
const app = new TwitchNotificationBot(
    new AppConfig(
        new DiscordConfig(
            'MTMzOTI5Mjg5NTMzMjc5NDQ5NA.GOW77y.ok6rrRhYNsx-_aeXNQp3Vr1EDXVHw-WqGE8_Ic',
            '1339292895332794494',
            '1203097199945195590')));
app.Start();