# Обучение партнёров Varka

Короткое видео (~35 сек) в стиле апдейтов Telegram: iPhone-рамка + подписи под телефоном.

## Файлы

| Файл | Назначение |
|---|---|
| `partner-guide.html` | Анимированный ролик (автоплей) |
| `partner-guide.mp4` | Готовое видео 1080×1920 |
| `record-guide.sh` | Пересъёмка через Xvfb + Chrome + ffmpeg |

## Сценарий

1. Чат с ботом Varka Partner  
2. Кнопка «Открыть Varka»  
3. Выбор точки  
4. Сбор заявки (пресеты + NFC)  
5. Отправка → готово  

## Просмотр

Открой `partner-guide.html` в браузере или кинь `partner-guide.mp4` в Telegram / Stories.

Пересъёмка:

```bash
bash varka/training/record-guide.sh
```
