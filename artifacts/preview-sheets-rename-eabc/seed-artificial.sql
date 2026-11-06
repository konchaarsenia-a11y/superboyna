-- Artificial preview seed only. No production client data.
INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES
  ('previewMarker', 'preview-sheets-rename-eabc', datetime('now')),
  ('weekDates', '{"Понедельник":"2099-01-05","Вторник":"2099-01-06","Среда":"2099-01-07","Четверг":"2099-01-08","Пятница":"2099-01-09","Суббота":"2099-01-10","Воскресенье":"2099-01-11"}', datetime('now'));

INSERT OR REPLACE INTO clients (id, match_key, nick, label, phone, address, note, dogs_json, telegram, updated_at) VALUES
  ('cli_zzz_preview', 'ZZZ_PREVIEW', 'zzz_preview', 'zzz_preview', '+375000000001', 'Минск, тест 1', 'preview-only', '["Тест"]', '', datetime('now'));

INSERT OR REPLACE INTO orders (id, date_iso, day_name, client, match_key, address, note, phone, basket_json, segment, source, status, updated_at, meta_json) VALUES
  ('Понедельник:ZZZ_PREVIEW', '2099-01-05', 'Понедельник', 'zzz_preview', 'ZZZ_PREVIEW', 'Минск, тест 1', 'preview seed', '+375000000001', '[{"name":"Курица","grams":100}]', 'ПП', 'preview', 'active', datetime('now'), '{}');
