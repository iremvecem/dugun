import { firebaseConfig, photoSettings } from "./firebase-config.js";

const loginPanel = document.getElementById("loginPanel");
const adminPanel = document.getElementById("adminPanel");
const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("adminEmail");
const passwordInput = document.getElementById("adminPassword");
const status = document.getElementById("adminStatus");
const gallery = document.getElementById("adminGallery");
const count = document.getElementById("adminCount");
const logoutButton = document.getElementById("adminLogout");
const setup = document.getElementById("adminSetupNotice");

const configured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value && !value.includes("PASTE_")
) && photoSettings.adminEmail !== "ADMIN_EMAIL_HERE";

if (!configured) {
  setup.hidden = false;
  loginPanel.hidden = true;
} else {
  startAdmin().catch((error) => setStatus(authMessage(error), "error"));
}

async function startAdmin() {
  const [appApi, authApi, firestoreApi, storageApi] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js")
  ]);

  const { initializeApp } = appApi;
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = authApi;
  const { collection, deleteDoc, doc, getFirestore, limit, onSnapshot, orderBy, query } = firestoreApi;
  const { deleteObject, getDownloadURL, getStorage, ref } = storageApi;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  let unsubscribe = null;
  const urlCache = new Map();

  emailInput.value = photoSettings.adminEmail;

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("Giriş yapılıyor…");
    try {
      await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
      passwordInput.value = "";
    } catch (error) {
      setStatus(authMessage(error), "error");
    }
  });

  logoutButton.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      if (unsubscribe) unsubscribe();
      loginPanel.hidden = false;
      adminPanel.hidden = true;
      gallery.innerHTML = "";
      return;
    }

    if (user.email !== photoSettings.adminEmail) {
      setStatus("Bu hesap yönetici olarak tanımlı değil.", "error");
      signOut(auth);
      return;
    }

    loginPanel.hidden = true;
    adminPanel.hidden = false;
    setStatus("");
    subscribe();
  });

  function subscribe() {
    if (unsubscribe) unsubscribe();
    const photosQuery = query(
      collection(db, "photos"),
      orderBy("createdAt", "desc"),
      limit(500)
    );

    unsubscribe = onSnapshot(photosQuery, (snapshot) => {
      count.textContent = `${snapshot.size} fotoğraf gösteriliyor`;
      gallery.innerHTML = "";
      snapshot.docs.forEach((photoDoc) => renderCard(photoDoc.id, photoDoc.data()));
    }, (error) => setStatus(authMessage(error), "error"));
  }

  function renderCard(id, photo) {
    const card = document.createElement("article");
    card.className = "admin-photo-card";

    const image = document.createElement("img");
    image.alt = photo.uploaderName || "Düğün fotoğrafı";
    image.loading = "lazy";

    const meta = document.createElement("div");
    meta.className = "admin-photo-meta";

    const name = document.createElement("strong");
    name.textContent = photo.uploaderName || "Misafir";

    const date = document.createElement("span");
    date.textContent = photo.createdAt?.toDate
      ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(photo.createdAt.toDate())
      : "Yükleniyor…";

    const actions = document.createElement("div");
    actions.className = "admin-photo-actions";

    const download = document.createElement("a");
    download.className = "admin-button";
    download.textContent = "Aç / indir";
    download.target = "_blank";
    download.rel = "noopener";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "admin-button danger";
    remove.textContent = "Sil";
    remove.addEventListener("click", async () => {
      const approved = window.confirm(`${photo.uploaderName || "Bu misafir"} tarafından yüklenen fotoğraf silinsin mi?`);
      if (!approved) return;

      remove.disabled = true;
      remove.textContent = "Siliniyor…";
      try {
        await Promise.allSettled([
          deleteObject(ref(storage, photo.fullPath)),
          deleteObject(ref(storage, photo.thumbPath))
        ]);
        await deleteDoc(doc(db, "photos", id));
      } catch (error) {
        setStatus(authMessage(error), "error");
        remove.disabled = false;
        remove.textContent = "Sil";
      }
    });

    actions.append(download, remove);
    meta.append(name, date, actions);
    card.append(image, meta);
    gallery.appendChild(card);

    resolveUrl(photo.thumbPath).then((url) => { image.src = url; });
    resolveUrl(photo.fullPath).then((url) => { download.href = url; });
  }

  function resolveUrl(path) {
    if (urlCache.has(path)) return urlCache.get(path);
    const promise = getDownloadURL(ref(storage, path));
    urlCache.set(path, promise);
    return promise;
  }
}

function setStatus(message, type = "info") {
  status.textContent = message;
  status.className = `admin-status ${type}`;
}

function authMessage(error) {
  const messages = {
    "auth/invalid-credential": "E-posta veya şifre yanlış.",
    "auth/too-many-requests": "Çok fazla deneme yapıldı; daha sonra tekrar deneyin.",
    "auth/network-request-failed": "İnternet bağlantısı kurulamadı.",
    "permission-denied": "Yönetici güvenlik kuralı bu işleme izin vermiyor.",
    "storage/unauthorized": "Storage yönetici kuralı bu işleme izin vermiyor."
  };
  return messages[error?.code] || error?.message || "Bir hata oluştu.";
}
