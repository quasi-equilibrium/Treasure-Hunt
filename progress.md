Original prompt: Mobil AR saklambac oyununu GitHub Pages uzerinde iki telefonla oynanabilir hale getir; son istek Bulan tarama yapmasin, isim yazma kalksin, arama kamerasi/pusulasi/titresimi ve Saklayan anahtar isareti duzelsin.

Progress:
- Supabase migration uygulandi ve GitHub Pages secret akisi hazirlandi.
- Oda kodlari 3 haneli sayiya cekildi ve kodla katilma Playwright ile test edildi.

Current TODO:
- Bulan taramasi kaldirildi; Saklayan tarama/plan akisi paylasiliyor.
- Anahtar isim inputu kaldirildi; otomatik anahtar etiketi kullaniliyor.
- Arama HUD'una alt pusula, metre ve daha guclu titresim eklendi.
- Saklayan anahtar taradiginda kamerada kirmizi uzun isaret gosteriliyor.

Next:
- Build/test/Playwright gorsel kontrol yapildi.
- Canli GitHub Pages deploy sonrasinda iki cihazli Supabase akisini test et.

Verification:
- npm run build gecti.
- npm test gecti.
- npm run test:ui gecti.
- develop-web-game Playwright client calisti; screenshot ve render_game_to_text kontrol edildi.

Latest fix:
- Alan Tara yapay ilerleme butonu kaldiriliyor; scan estimator artik sure + yon kapsama + cihaz aci degisimi yeterli degilse 100 yapmiyor.
- Tarama Tamamlandi butonu tiklansa bile estimator yeterli degilse hiding asamasina gecmiyor.
- iPhone pusula izni kamera izninden once isteniyor; pusula yoksa oyun fallback ile devam etmiyor, acik hata veriyor.

Latest verification:
- scan estimator icin hizli dolmama unit testi eklendi.
- Tarama ekraninda butonun 0% iken pasif kaldigi gorsel olarak kontrol edildi.
