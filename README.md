# Treasure Hunt AR

Mobil AR saklambaç prototipi. İki oyuncu `Saklayan` ve `Bulan` rolleriyle oynar; oda kodu Supabase Realtime üzerinden paylaşılır. Android Chrome + ARCore cihazlarda WebXR `immersive-ar` denenir, destek yoksa kamera üstü fallback kullanılır.

## Kurulum

```bash
npm install
cp .env.example .env
npm run dev
```

Supabase kullanmak için `supabase/migrations/20260522100000_initial_treasure_hunt.sql` migration dosyasını projenize uygulayın ve `.env` içine `VITE_SUPABASE_URL` ile `VITE_SUPABASE_ANON_KEY` değerlerini yazın. Env yoksa uygulama tek cihaz/tarayıcı geliştirme demosu için localStorage modunda açılır.

GitHub Pages deploy için aynı değerleri repo secret olarak ekleyin:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Secret yoksa canlı site açılır, ancak iki farklı telefon aynı odaya bağlanamaz; demo modu her cihazın kendi localStorage alanını kullanır.

## Mobil Test

Kamera ve WebXR için HTTPS gerekir. Gerçek telefon testinde Vercel/Netlify preview veya HTTPS tünel kullanın. Android Chrome + ARCore gerçek WebXR için ana hedeftir. iPhone Safari tarafında `immersive-ar` güvenilir kabul edilmez; fallback kamera/pusula akışı kullanılır.

## Oyun Akışı

- Saklayan 1-5 anahtar seçer ve oda kurar.
- Bulan oda koduyla katılır.
- İki oyuncu hazır olunca güvenlik/izin ekranı açılır.
- Kalibrasyon sonrası ev tarama barı dolana kadar kamera/pusula hareketi izlenir.
- Saklayan anahtar nesnelerini manuel işaretler, sonra telefonu hazine olarak kaydedip aramayı başlatır.
- Bulan pusula ve yakınlık göstergesiyle anahtarları sırayla bulur.
- Son aşamada yakınlık barı yerine ses/titreşim dedektörü çalışır.

## Komutlar

```bash
npm run dev       # geliştirme sunucusu
npm run build     # TypeScript + production build
npm test          # unit/integration testleri
npm run test:ui   # Playwright mobil smoke testi
```
