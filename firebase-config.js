// Firebase bağlantı ayarları
export const firebaseConfig = {
  apiKey: "AIzaSyAtrRq_H2csmZiBp45fCMWemp2yNllgRfQ",
  authDomain: "irem-cem-dugun.firebaseapp.com",
  projectId: "irem-cem-dugun",
  storageBucket: "irem-cem-dugun.firebasestorage.app",
  messagingSenderId: "318982226254",
  appId: "1:318982226254:web:b959fbba2258d651b8de1f"
};

export const photoSettings = {
  // photos-admin.html sayfasında kullanılacak yönetici hesabı
  adminEmail: "iremozdogan@gmail.com",

  // Kişi/tarayıcı başına en fazla fotoğraf
  maxPhotosPerDevice: 25,

  // Türkiye saatiyle yükleme dönemi
  uploadStart: "2026-07-16T00:00:00+03:00",
  uploadEnd: "2026-10-31T23:59:59+03:00",

  // Yükleme öncesi görsel küçültme ayarları
  fullMaxEdge: 1800,
  fullQuality: 0.82,
  thumbMaxEdge: 520,
  thumbQuality: 0.72,

  liveGalleryLimit: 80,
  pageSize: 80
};
