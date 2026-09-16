# Обучение партнёров Varka

## Реальное видео (Telegram → Mini App, iPhone 16)

| Файл | Назначение |
|---|---|
| `real/varka-real-tg-iphone16.mp4` | **Основной ролик** (~18 с): реальный чат GOODBOY_LG → «Открыть» → заказ/пресеты → точки |
| `real/iphone16-*.png` | Кадры того же флоу в рамке iPhone 16 |
| `real/record-real-tg.sh` | Хелпер записи с уже залогиненного Telegram Web |

Сценарий ролика:

1. Список чатов Telegram  
2. Чат **GOODBOY_LG** + синяя кнопка **Открыть**  
3. Миниапп: лакомства / пресеты 250  
4. Экран точек (без боевой отправки)

## Старый анимированный гайд

| Файл | Назначение |
|---|---|
| `partner-guide.html` | Анимированный ролик (автоплей) |
| `partner-guide.mp4` | Старое видео 1080×1920 |
| `record-guide.sh` | Пересъёмка через Xvfb + Chrome + ffmpeg |

```bash
bash varka/training/record-guide.sh
```
