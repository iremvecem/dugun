# İrem & Cem fotoğraf galerisi — Firebase kurulumu

Kod hazır. Çalışması için bir Firebase projesine bağlanması gerekiyor.

## 1. Firebase projesi oluştur

1. Firebase Console'a girip yeni bir proje oluştur.
2. Projeyi **Blaze (kullandıkça öde)** plana geçir. Cloud Storage artık Blaze planı gerektiriyor; ücretsiz kullanım kotaları yine mevcut.
3. Bütçe uyarısı oluştur. Uyarı harcamayı otomatik durdurmaz, yalnızca haber verir.

## 2. Web uygulamasını ekle

1. Project settings > Your apps > Web app yolundan bir web uygulaması ekle.
2. Sana verilen `firebaseConfig` değerlerini `firebase-config.js` dosyasına yapıştır.
3. `storageBucket` alanını Firebase'in verdiği biçimde aynen kullan. Yeni projelerde genellikle `PROJE_ID.firebasestorage.app` olur.

## 3. Authentication ayarları

Authentication > Sign-in method bölümünde:

- **Anonymous** giriş yöntemini aç. Misafirler hesap oluşturmadan bu yöntemle giriş yapar.
- **Email/Password** yöntemini aç. Bu, yalnızca yönetici sayfası içindir.

Authentication > Users bölümünde kendi e-posta adresinle bir kullanıcı oluştur ve güçlü bir şifre belirle.

Aynı e-posta adresini üç yere yaz:

- `firebase-config.js` içindeki `adminEmail`
- `firestore.rules` içindeki `ADMIN_EMAIL_HERE`
- `storage.rules` içindeki `ADMIN_EMAIL_HERE`

## 4. Firestore oluştur ve kuralları yayınla

1. Firestore Database oluştur.
2. Rules sekmesine `firestore.rules` dosyasının tamamını yapıştır.
3. Publish'e bas.

## 5. Storage oluştur ve kuralları yayınla

1. Storage bölümünden varsayılan bucket'ı oluştur.
2. Ücretsiz Google Cloud Storage kotasından yararlanmak için uygun ise `us-central1`, `us-east1` veya `us-west1` bölgelerinden birini seç. Türkiye'ye daha yakın bir Avrupa bölgesi daha hızlı olabilir ancak Always Free depolama kotası bu üç ABD bölgesiyle sınırlıdır.
3. Rules sekmesine `storage.rules` dosyasının tamamını yapıştır.
4. Publish'e bas.

## 6. Alan adını yetkilendir

Authentication > Settings > Authorized domains bölümüne sitenin alan adını ekle:

- GitHub Pages kullanıyorsan: `KULLANICI_ADIN.github.io`
- Özel alan adı kullanıyorsan onu da ayrıca ekle.

## 7. Yükleme tarihleri

Şu an test yapabilmen için yükleme başlangıcı **16 Temmuz 2026**, kapanışı **31 Ekim 2026 23.59** olarak ayarlı.

Tarih değiştirirsen iki yeri birlikte güncelle:

- `firebase-config.js` içindeki `uploadStart` ve `uploadEnd`
- `storage.rules` içindeki `uploadWindowOpen()` zaman değerleri

Kişi/cihaz başına üst sınır 25 fotoğraftır. Misafir tarayıcı verisini silerse yeni anonim kullanıcı oluşabileceği için bu sınır kötü niyetli kullanıma karşı mutlak değildir; normal düğün kullanımı için yeterlidir.

## 8. Siteyi yayınla ve test et

1. Bu klasördeki tüm dosyaları GitHub reposuna yükle.
2. Siteyi açıp Fotoğraflar bölümünde adını yaz.
3. Kameradan ve galeriden birer test fotoğrafı yükle.
4. Başka bir telefondan galerinin canlı güncellendiğini kontrol et.
5. `photos-admin.html` adresini açıp yönetici hesabınla giriş yap; test fotoğrafını sil.

Yönetici adresi örneği:

`https://KULLANICI_ADIN.github.io/REPO_ADI/photos-admin.html`

## Dosyalar

- `index.html`: Davet sitesi ve misafir fotoğraf arayüzü
- `photos.js`: Yükleme, sıkıştırma, limit ve canlı galeri
- `firebase-config.js`: Firebase bağlantı bilgileri ve ayarlar
- `photos-admin.html` / `photos-admin.js`: Yönetici girişi, indirme ve silme
- `firestore.rules`: Fotoğraf kayıtları ve kullanıcı limiti güvenliği
- `storage.rules`: Dosya tipi, boyut, slot ve tarih güvenliği
