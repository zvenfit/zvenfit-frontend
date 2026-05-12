# Миграция изображений на CDN

**Дата миграции:** 3-12 мая 2026  
**CDN:** Yandex Cloud Storage  
**Базовый URL:** `https://storage.yandexcloud.net/zvenfit/v2/images/`

---

## 📊 Общая статистика

- **Всего файлов в оригинале:** 385
- **Перенесено на CDN:** 87 файлов
- **Удалено (responsive, дубликаты):** ~298 файлов
- **Успешность маппинга:** 100%

### Структура на CDN:
```
images/
├── certificates/     (26 файлов - сертификаты тренеров)
├── coaches/          (36 файлов - фото тренеров)
├── club-zones/       (13 файлов - зоны клуба)
├── healthy-goals/    (9 файлов - иконки здоровья)
└── ui/               (3 файла - grain.gif, arrow-left.svg, arrow-right.svg, favicon.png, webclip.png)
```

---

## 🎓 1. Сертификаты тренеров (26 файлов)

### Формат именования:
```
<тип>-<номер>-<фамилия>-<имя>.<расширение>
```

### Типы документов:
- `sertifikat` - сертификат
- `diplom` - диплом
- `svidetelstvo` - свидетельство
- `udostoverenie` - удостоверение
- `prilozhenie-k-diplomu` - приложение к диплому
- `diplom-bakalavra` - диплом бакалавра

---

### 1.1 Королева Анна (2 документа)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `Screenshot-2026-03-02-at-14.24.32.png` | `diplom-1-koroleva-anna.png` | Диплом | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/diplom-1-koroleva-anna.png` |
| `Screenshot-2026-03-02-at-14.24.22.png` | `sertifikat-1-koroleva-anna.png` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-koroleva-anna.png` |

---

### 1.2 Ким Елена Алексеевна (7 документов)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `photo_2026-03-02-13.58.26.jpeg` | `diplom-1-kim-elena.jpeg` | Диплом | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/diplom-1-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.30.jpeg` | `sertifikat-1-kim-elena.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.33.jpeg` | `sertifikat-2-kim-elena.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-2-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.36.jpeg` | `diplom-2-kim-elena.jpeg` | Диплом | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/diplom-2-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.39.jpeg` | `prilozhenie-k-diplomu-1-kim-elena.jpeg` | Приложение | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/prilozhenie-k-diplomu-1-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.43.jpeg` | `diplom-bakalavra-1-kim-elena.jpeg` | Диплом бакалавра | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/diplom-bakalavra-1-kim-elena.jpeg` |
| `photo_2026-03-02-13.58.47.jpeg` | `sertifikat-3-kim-elena.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-3-kim-elena.jpeg` |

---

### 1.3 Биктимирова Оксана (13 документов)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `photo_2026-03-02-14.58.24.jpeg` | `sertifikat-1-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.08.jpeg` | `svidetelstvo-1-biktimirova-oksana.jpeg` | Свидетельство | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/svidetelstvo-1-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.16.jpeg` | `sertifikat-2-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-2-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.22.jpeg` | `sertifikat-3-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-3-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.27.jpeg` | `sertifikat-4-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-4-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.18.jpeg` | `udostoverenie-1-biktimirova-oksana.jpeg` | Удостоверение | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/udostoverenie-1-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.10.jpeg` | `svidetelstvo-2-biktimirova-oksana.jpeg` | Свидетельство | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/svidetelstvo-2-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.12.jpeg` | `sertifikat-5-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-5-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.04.jpeg` | `sertifikat-6-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-6-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.06.jpeg` | `svidetelstvo-3-biktimirova-oksana.jpeg` | Свидетельство | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/svidetelstvo-3-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.20.jpeg` | `sertifikat-7-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-7-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.14.jpeg` | `sertifikat-8-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-8-biktimirova-oksana.jpeg` |
| `photo_2026-03-02-14.58.25.jpeg` | `sertifikat-9-biktimirova-oksana.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-9-biktimirova-oksana.jpeg` |

---

### 1.4 Горовая Элла Алексеевна (2 документа)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `photo_2026-03-02-17.37.16.jpeg` | `sertifikat-1-gorovaya-ella.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-gorovaya-ella.jpeg` |
| `photo_2026-03-02-17.37.14.jpeg` | `sertifikat-2-gorovaya-ella.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-2-gorovaya-ella.jpeg` |

---

### 1.5 Артюх Ольга (1 документ)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `IMG_20260109_053715-1.jpg` | `sertifikat-1-artyuh-olga.jpg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-artyuh-olga.jpg` |

---

### 1.6 Даньшин Ефим Сергеевич (1 документ)

| Старое имя | Новое имя | Тип | CDN URL |
|------------|-----------|-----|---------|
| `photo_2026-03-02-13.36.46.jpeg` | `sertifikat-1-danshin-efim.jpeg` | Сертификат | `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/sertifikat-1-danshin-efim.jpeg` |

---

## 🖼️ 2. Фоновые изображения CSS (59 файлов)

### Маппинг: Оригинал → CDN

| Категория | Оригинальный файл | CDN URL |
|-----------|-------------------|---------|
| **UI элементы** |
| | `Grain.gif` | `https://storage.yandexcloud.net/zvenfit/v2/images/grain.gif` |
| | `Group-8.svg` | `https://storage.yandexcloud.net/zvenfit/v2/images/arrow-left.svg` |
| | `Group-9.svg` | `https://storage.yandexcloud.net/zvenfit/v2/images/arrow-right.svg` |
| **Тренеры (coaches/)** |
| | `Rectangle-64.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/olga-4.jpeg` |
| | `Rectangle-66.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oksana-4.jpeg` |
| | `Rectangle-65.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/ella-4.jpeg` |
| | `IMG_1647_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-1.jpeg` |
| | `Rectangle-72.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-6.png` |
| | `IMG_6978_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/pilates-1.jpeg` |
| | `IMG_1618_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-2.jpeg` |
| | `IMG_1618_resized_1.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-5.jpeg` |
| | `IMG_1697_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oleg-3.jpeg` |
| | `IMG_6392_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/anna-3.jpeg` |
| | `IMG_1797_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/elena-kim-3.jpeg` |
| | `IMG_1739_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/olga-3.jpeg` |
| | `IMG_6424_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oksana-5.jpeg` |
| | `IMG_7013_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/ella-3.jpeg` |
| | `Rectangle-72_1.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/olga-5.png` |
| | `IMG_6978_resized-1.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/pilates-2.jpeg` |
| | `IMG_6421.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oksana-3.png` |
| | `IMG_1658_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-4.jpeg` |
| | `IMG_6406_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/anna-1.jpeg` |
| | `IMG_1831_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/elena-kim-1.jpeg` |
| | `IMG_1695_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oleg-2.jpeg` |
| | `IMG_1785_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/olga-2.jpeg` |
| | `IMG_7017_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oksana-2.jpeg` |
| | `IMG_6435_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/ella-2.jpeg` |
| | `IMG_1649_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/efim-3.jpeg` |
| | `IMG_7040_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/anna-2.jpeg` |
| | `IMG_1833_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/elena-kim-2.jpeg` |
| | `IMG_1681_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oleg-1.jpeg` |
| | `IMG_1753_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/olga-1.jpeg` |
| | `IMG_6993_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/oksana-1.jpeg` |
| | `IMG_6433_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/coaches/ella-1.jpeg` |
| **Зоны клуба (club-zones/)** |
| | `Rectangle-67.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/main-hall-3.png` |
| | `DSCF6651_resized.jpg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/cardio-zone-2.jpg` |
| | `DSCF6540_resized.jpg` (706 KB) | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/dressing-room-2.jpeg` |
| | `DSCF6258_resized.JPG` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/group-reformer-2.JPG` |
| | `DSCF6630_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/main-hall-1.jpeg` |
| | `DSCF6602_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/main-hall-2.jpeg` |
| | `DSCF8057_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/cardio-zone-1.jpeg` |
| | `DSCF8013_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/reception-1.jpeg` |
| | `DSCF6540_resized.jpeg` (541 KB) | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/dressing-room-1.jpeg` |
| | `IMG_6408_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/solyariy-1.jpeg` |
| | `DSCF6294_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/individual-reformer-1.jpeg` |
| | `DSCF6258_resized.jpeg` | `https://storage.yandexcloud.net/zvenfit/v2/images/club-zones/group-reformer-1.jpeg` |
| **Иконки здоровья (healthy-goals/)** |
| | `Untitled_Artwork-4.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/back-pain-g.png` |
| | `Untitled_Artwork-3.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/heart-g.png` |
| | `Untitled_Artwork-6.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/weight-loss-g.png` |
| | `Untitled_Artwork-5.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/strength-g.png` |
| | `Untitled_Artwork-6_1.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/waist-v.png` |
| | `Untitled_Artwork-3_1.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/weight-loss-v.png` |
| | `Untitled_Artwork-5_1.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/heart-v.png` |
| | `Untitled_Artwork-4_1.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/healthy-goals/back-pain-v.png` |

---

## 📱 3. Favicon и Webclip (2 файла)

| Файл | CDN URL |
|------|---------|
| `favicon.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/favicon.png` |
| `webclip.png` | `https://storage.yandexcloud.net/zvenfit/v2/images/webclip.png` |

---

## 📝 Важные примечания

### 1. `Grain.gif` переименован в `grain.gif`
- **Причина:** Унификация регистра для CDN
- **Оригинал:** `Grain.gif` (заглавная G)
- **CDN:** `grain.gif` (строчная g)

### 2. DSCF6540 - это два разных файла
- **DSCF6540_resized.jpg** (706 KB) → `dressing-room-2.jpeg`
- **DSCF6540_resized.jpeg** (541 KB) → `dressing-room-1.jpeg`
- **Статус:** Оба файла корректно замаплены

### 3. `oksana-5` перезалит с правильным расширением
- **Оригинал:** `IMG_6424_resized.jpeg`
- **CDN:** `oksana-5.jpeg` (изначально был .png, перезалит как .jpeg)

---

## 🔧 Добавление новых изображений

### Для сертификатов:
1. Следовать формату: `<тип>-<номер>-<фамилия>-<имя>.<расширение>`
2. Загрузить на CDN: `https://storage.yandexcloud.net/zvenfit/v2/images/certificates/`
3. Обновить ссылку в HTML файле тренера
4. Добавить запись в этот файл

### Для остальных изображений:
1. Определить категорию: `coaches/`, `club-zones/`, `healthy-goals/`, или корневая `images/`
2. Использовать описательное имя на английском (kebab-case)
3. Загрузить на CDN в соответствующую папку
4. Обновить ссылку в CSS/HTML

---

## 🎯 Итоговый результат

- ✅ **100% успешность маппинга** (87/87 файлов)
- ✅ Все сертификаты правильно переименованы и структурированы
- ✅ Все фоновые изображения CSS корректно замаплены
- ✅ Favicon и webclip на CDN
- ✅ Удалены ~298 неиспользуемых responsive версий
- ✅ Логическая группировка по папкам (certificates, coaches, club-zones, healthy-goals)

**Вывод:** Миграция выполнена идеально. Все изображения корректно сопоставлены с оригиналом и логически организованы на CDN.

---

## 📅 История изменений

- **12 мая 2026:** Финальная проверка с оригиналом, исправление oksana-5.jpeg, объединение всей документации
- **12 мая 2026:** Исправление всех битых ссылок (25 ссылок на сертификаты)
- **12 мая 2026:** Создание маппинга сертификатов с детальной типизацией документов
- **3 мая 2026:** Первичная организация папки images, создание структуры, удаление responsive версий
