# TwitchNotificationBot

Бот следит за каналами Twitch и сообщает в Discord и Telegram, когда стрим начался, изменился или закончился.

Доступ к Twitch идёт по ключу приложения (client credentials). Для уведомлений используются discord.js и node-telegram-bot-api. Входящий порт боту не нужен: опрос Twitch, шлюз Discord и polling Telegram — исходящие соединения.

Каталог приложения — `TwitchNotificationBot/`. Команды ниже выполняются из него.

## Поведение

Стратегия по умолчанию — `poll`. Бот спрашивает Helix не чаще, чем задано в настройках. Интервал не может быть меньше 10 минут.

- Старт стрима отправляет новое сообщение. Превью скачивается и прикрепляется файлом.
- Смена названия или игры правит это же сообщение и заменяет превью.
- Если название и игра не менялись, то же обновление уходит через `twitchPreviewRefreshMinutes`. Этот интервал тоже не меньше 10 минут.
- Конец стрима отправляет отдельное сообщение.

Номера уже отправленных сообщений и токен Twitch хранятся в `data/`. После перезапуска бот продолжает править те же карточки. Если за время простоя стрим закончился, уходит уведомление о конце.

В `settings.json` можно указать стратегию `websocket`. Она подписывается на EventSub через исходящее соединение. Для обычной работы достаточно `poll`.

## Настройки

Секреты лежат в `config/.env`, остальные параметры — в `config/settings.json`. Оба файла нужны. Если какого-то нет, процесс завершается с ошибкой.

Примеры без секретов: `config/.env.example` и `config/settings.example.json`.

`config/.env`:

| Переменная | Назначение |
| --- | --- |
| `DISCORD_TOKEN` | Токен бота Discord |
| `DISCORD_CLIENT_ID` | Идентификатор приложения Discord |
| `TWITCH_CLIENT_ID` | Идентификатор приложения Twitch |
| `TWITCH_CLIENT_SECRET` | Секрет приложения Twitch |
| `TELEGRAM_BOT_TOKEN` | Токен бота Telegram. Пустое значение отключает Telegram |

`config/settings.json`:

| Поле | Назначение |
| --- | --- |
| `discordGuildId` | Сервер Discord. Строка, не число |
| `discordRespondChannelId` | Канал для уведомлений Discord. Строка |
| `telegramRespondChannelId` | Чат Telegram |
| `telegramRespondThreadId` | Тема чата Telegram или `null` |
| `twitchMonitorChannelNames` | Логины каналов Twitch, не больше 100 |
| `messagesStartAnnouncement` | Тексты о начале стрима |
| `messagesEndAnnouncement` | Тексты о конце стрима |
| `twitchObservation` | `poll` или `websocket` |
| `twitchPollIntervalMinutes` | Интервал опроса Helix, целое число от 10 |
| `twitchPreviewRefreshMinutes` | Интервал обновления превью, целое число от 10 |

Идентификаторы Discord записываются строками: длинное число в JSON теряет точность.

Файлы `config/.env`, `config/settings.json` и каталог `data/` не коммитятся.

## Локальный запуск

Нужен Node.js 22.

```powershell
cd TwitchNotificationBot
copy config\.env.example config\.env
copy config\settings.example.json config\settings.json
npm install
node app.js
```

Перед `node app.js` в `.env` и `settings.json` должны быть свои токены и каналы.

Остановка через Ctrl+C закрывает Discord и Telegram.

Проверки:

```powershell
npm test
```

## Docker

Образ собирается из `TwitchNotificationBot/Dockerfile`. Секреты и `data/` в образ не входят: они подключаются при запуске.

```powershell
cd TwitchNotificationBot
docker compose build
docker compose up
```

`docker compose stop` останавливает контейнер и вызывает закрытие сервисов. Каталог `data/` на хосте сохраняет токен Twitch и номера сообщений между перезапусками.

Автоперезапуск в `docker-compose.yml` не включён. Если файла конфигурации нет, контейнер завершается с ошибкой и не запускается снова сам.

Отправка коммита на GitHub запускает сборку того же образа в Actions. Эта сборка только проверяет, что образ создаётся. Бот там не стартует, и образ никуда не публикуется.
