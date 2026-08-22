# FitZortNess

Telegram üzerinde çalışan, Türkçe konuşan bir fitness koçu botu. Deterministik bir kural motoru (program üretimi, program analizi, split planlama) ile tool-calling destekli bir LLM ajanını birlikte kullanır: karar ve hesaplamayı motor yapar, doğal sohbeti model yönetir.

Projenin çıkış noktası bu [LinkedIn gönderisi](https://www.linkedin.com/posts/baki-gul_t%C3%BCrk-bir-geli%C5%9Ftirici-1324-fitness-egzersizini-activity-7477216804113805312-o8Uz). Egzersiz veri seti [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) reposundan alınmıştır.

## Özellikler

- **Program üretimi ve analizi**: hedef, seviye, ekipman, sakatlık/kısıt bilgisine göre deterministik kural motoruyla haftalık program kurar; kullanıcının yazdığı veya fotoğrafını gönderdiği mevcut programı analiz eder.
- **LLM sohbet katmanı**: genel sohbeti ve program araçlarını (`prepare_training_program`, `analyze_training_program`, `discard_training_draft`) tool-calling ile yöneten bir ajan; OpenAI Responses API veya OpenAI-uyumlu yerel bir endpoint ile çalışabilir.
- **Görsel program okuma**: Telegram'a gönderilen ekran görüntüsü/fotoğraftan program satırlarını çıkarır ve aynı analiz motorundan geçirir.
- **Güvenlik/triyaj kuralları**: acil ve önleyici sağlık uyarıları modelden bağımsız, deterministik kurallarla tetiklenir.
- **Kaynaklı bilgi tabanı**: spor/antrenman iddiaları `knowledge/` altındaki şema doğrulanmış kaynaklardan gelir; marka tanımı, resmi kural ve güncelliği gereken iddialar birbirinden ayrılır.
- **Egzersiz görselleri**: onaylı GIF'ler yalnızca `media/exercise-media.json` manifestindeki lisanslı, hash doğrulanmış kaynaklardan sunulur (bkz. [media/README.md](./media/README.md)).
- **Admin araçları**: kullanıcı/kullanım/log/hata görüntüleme, oturum değerlendirme, geri bildirim özetleri ve veri silme komutları.

## Gereksinimler

- Node.js 24+
- Bir Telegram bot token'ı ([@BotFather](https://t.me/BotFather))
- Opsiyonel: sohbet katmanı için bir OpenAI API anahtarı veya OpenAI-uyumlu bir yerel/uzak endpoint

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` dosyasını doldur (bkz. [Ortam değişkenleri](#ortam-değişkenleri)).

Egzersiz veri setini indir (eğitim ve ticari olmayan kullanım koşullarını kabul ediyorsan):

```bash
git init vendor/exercises-dataset
git -C vendor/exercises-dataset remote add origin https://github.com/hasaneyldrm/exercises-dataset.git
git -C vendor/exercises-dataset fetch --depth 1 origin 43cf5cef31841e8ea50788d315ec73e2d6d232d0
git -C vendor/exercises-dataset checkout --detach FETCH_HEAD
```

Botu kullanabilecek Telegram kullanıcı ID'lerini `allowed-users.txt` dosyasına, admin ID'lerini `admin-users.txt` dosyasına (ya da `TELEGRAM_ADMIN_USER_IDS` ortam değişkenine) bir satıra bir ID gelecek şekilde ekle. Herkese açık bir pilot için `TELEGRAM_ALLOW_ALL=true` ayarlanabilir.

## Çalıştırma

```bash
npm run setup:check   # zorunlu dosyalar (.env, veri seti, medya manifesti) hazır mı kontrol eder
npm run bot           # veri setini/medyayı içe aktarır, smoke test çalıştırır, botu başlatır
npm test              # birim ve entegrasyon testleri
```

## Ortam değişkenleri

En önemlileri; tam liste için [.env.example](./.env.example):

| Değişken | Açıklama |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Zorunlu. Bot token'ı. |
| `TELEGRAM_ALLOWED_USER_IDS_FILE` / `TELEGRAM_ALLOWED_USER_IDS` | İzinli kullanıcı listesi (dosya veya virgülle ayrılmış ID'ler). |
| `TELEGRAM_ADMIN_USER_IDS` | Admin komutlarına erişebilecek ID'ler. |
| `OPENAI_API_KEY` / `LLM_*` | Sohbet katmanı için model erişimi. Boş bırakılırsa bot yalnızca kural motoruyla, sabit metin yanıtlarıyla çalışır. |
| `DAILY_USER_MESSAGE_LIMIT` / `DAILY_TOTAL_MESSAGE_LIMIT` | Günlük kullanım limitleri. |
| `DB_PATH` | SQLite veritabanı yolu. |

## Proje yapısı

```
src/
  bot.js              Telegram mesaj döngüsü, komut yönlendirme, oturum akışı
  coachTools.js        LLM ajanının çağırabildiği araçlar (program üret/analiz et/taslağı iptal et)
  openaiClient.js       Sohbet/agent isteklerini kurar, bilgi tabanı bağlamını ekler
  llmProvider.js        Responses / Chat Completions API istemcisi ve tool-calling döngüsü
  programEngine.js       Kural motoru: program üretimi ve analiz
  exerciseSearch.js       Egzersiz veri setinde arama ve eşleştirme
  knowledgeBase.js        Kaynaklı spor/antrenman bilgi tabanı erişimi
  safetyPolicy.js         Acil/önleyici sağlık triyaj kuralları
  conversationTracker.js  Oturum/konuşma kaydı ve analitik
  conversationContext.js  Tur bağlamı: kullanıcı/asistan mesajlarının kaydını tek yerden yönetir
  db.js                  SQLite şeması ve erişim katmanı
knowledge/    Kaynak, iddia ve spor tanımı JSON'ları (şema doğrulamalı)
media/        Onaylı egzersiz GIF manifesti ve atıflar
test/         Birim ve entegrasyon testleri (node --test)
```

## Lisans ve atıf

Egzersiz veri seti [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) kaynağına aittir; eğitim ve ticari olmayan kullanım koşullarına tabidir. Egzersiz görselleri Wikimedia Commons'tan onaylı, lisans ve atıf bilgisi kayıtlı kaynaklardan sunulur (bkz. [media/ATTRIBUTIONS.md](./media/ATTRIBUTIONS.md)).
