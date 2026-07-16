import { firebaseConfig, photoSettings } from "./firebase-config.js";

let uploadBytesResumableFn = null;

const elements = {
  app: document.getElementById("photoApp"),
  setup: document.getElementById("photoSetupNotice"),
  content: document.getElementById("photoContent"),
  uploaderName: document.getElementById("photoUploaderName"),
  cameraInput: document.getElementById("cameraInput"),
  galleryInput: document.getElementById("galleryInput"),
  cameraButton: document.getElementById("cameraButton"),
  galleryButton: document.getElementById("galleryButton"),
  remaining: document.getElementById("photoRemaining"),
  queue: document.getElementById("uploadQueue"),
  status: document.getElementById("photoStatus"),
  closed: document.getElementById("photoClosedMessage"),
  gallery: document.getElementById("photoGallery"),
  empty: document.getElementById("photoGalleryEmpty"),
  loadMore: document.getElementById("loadMorePhotos"),
  lightbox: document.getElementById("photoLightbox"),
  lightboxImage: document.getElementById("photoLightboxImage"),
  lightboxCaption: document.getElementById("photoLightboxCaption"),
  lightboxClose: document.getElementById("photoLightboxClose")
};

if (!elements.app) {
  throw new Error("Fotoğraf bölümü bulunamadı.");
}

const configured = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value && !value.includes("PASTE_")
);

if (!configured) {
  elements.setup.hidden = false;
  elements.content.hidden = true;
} else {
  startPhotoApp().catch((error) => {
    console.error(error);
    showStatus(firebaseErrorMessage(error), "error");
  });
}

async function startPhotoApp() {
  const [appApi, authApi, firestoreApi, storageApi] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js")
  ]);

  const { initializeApp } = appApi;
  const { getAuth, onAuthStateChanged, signInAnonymously } = authApi;
  const {
    collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot,
    orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter
  } = firestoreApi;
  const { deleteObject, getDownloadURL, getStorage, ref, uploadBytesResumable } = storageApi;
  uploadBytesResumableFn = uploadBytesResumable;

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  const state = {
    user: null,
    uploadCount: 0,
    uploading: false,
    lastVisible: null,
    photos: new Map(),
    urlCache: new Map(),
    unsubscribe: null
  };

  const rememberedName = localStorage.getItem("iremCemPhotoName");
  if (rememberedName) elements.uploaderName.value = rememberedName;

  elements.uploaderName.addEventListener("change", () => {
    const value = cleanName(elements.uploaderName.value);
    elements.uploaderName.value = value;
    if (value) localStorage.setItem("iremCemPhotoName", value);
  });

  elements.cameraButton.addEventListener("click", () => elements.cameraInput.click());
  elements.galleryButton.addEventListener("click", () => elements.galleryInput.click());
  elements.cameraInput.addEventListener("change", () => consumeSelection(elements.cameraInput));
  elements.galleryInput.addEventListener("change", () => consumeSelection(elements.galleryInput));
  elements.loadMore.addEventListener("click", loadMorePhotos);
  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", (event) => {
    if (event.target === elements.lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.lightbox.hidden) closeLightbox();
  });

  updateWindowState();
  setInterval(updateWindowState, 60_000);

  onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        await signInAnonymously(auth);
        return;
      }

      state.user = user;
      await refreshUploadCount();
      subscribeToGallery();
    } catch (error) {
      console.error(error);
      showStatus(firebaseErrorMessage(error), "error");
    }
  });

  async function refreshUploadCount() {
    if (!state.user) return;
    const snapshot = await getDoc(doc(db, "uploaders", state.user.uid));
    state.uploadCount = snapshot.exists() ? Number(snapshot.data().uploadCount || 0) : 0;
    updateRemaining();
  }

  function updateRemaining() {
    const remaining = Math.max(0, photoSettings.maxPhotosPerDevice - state.uploadCount);
    elements.remaining.textContent = `${remaining} fotoğraf hakkınız kaldı`;
    const disabled = remaining === 0 || state.uploading || !state.user || !uploadWindowIsOpen();
    elements.cameraButton.disabled = disabled;
    elements.galleryButton.disabled = disabled;

    if (remaining === 0) {
      elements.closed.hidden = false;
      elements.closed.textContent = "Bu cihaz için 25 fotoğraf sınırına ulaşıldı.";
    }
  }

  function updateWindowState() {
    const now = Date.now();
    const start = new Date(photoSettings.uploadStart).getTime();
    const end = new Date(photoSettings.uploadEnd).getTime();

    if (now < start) {
      elements.closed.hidden = false;
      elements.closed.textContent = `Fotoğraf yükleme ${formatDate(photoSettings.uploadStart)} tarihinde açılacak.`;
    } else if (now > end) {
      elements.closed.hidden = false;
      elements.closed.textContent = "Fotoğraf yükleme süresi sona erdi. Galeri görüntülenmeye devam ediyor.";
    } else if (state.uploadCount < photoSettings.maxPhotosPerDevice) {
      elements.closed.hidden = true;
      elements.closed.textContent = "";
    }

    updateRemaining();
  }

  function uploadWindowIsOpen() {
    const now = Date.now();
    return now >= new Date(photoSettings.uploadStart).getTime()
      && now <= new Date(photoSettings.uploadEnd).getTime();
  }

  async function consumeSelection(input) {
    const files = Array.from(input.files || []);
    input.value = "";
    if (!files.length || state.uploading) return;

    const uploaderName = cleanName(elements.uploaderName.value);
    if (!uploaderName) {
      showStatus("Önce adınızı yazın.", "error");
      elements.uploaderName.focus();
      return;
    }

    localStorage.setItem("iremCemPhotoName", uploaderName);

    if (!uploadWindowIsOpen()) {
      showStatus("Fotoğraf yükleme şu anda kapalı.", "error");
      return;
    }

    const remaining = photoSettings.maxPhotosPerDevice - state.uploadCount;
    if (remaining <= 0) {
      showStatus("Bu cihaz için fotoğraf sınırına ulaşıldı.", "error");
      return;
    }

    const acceptedFiles = files.slice(0, remaining);
    if (files.length > acceptedFiles.length) {
      showStatus(`Yalnızca kalan ${remaining} fotoğraf yüklenecek.`, "info");
    } else {
      showStatus("", "info");
    }

    state.uploading = true;
    updateRemaining();
    elements.queue.innerHTML = "";

    let successCount = 0;
    for (const file of acceptedFiles) {
      const row = createQueueRow(file.name);
      elements.queue.appendChild(row.element);

      try {
        if (!file.type.startsWith("image/")) {
          throw new Error("Bu dosya bir fotoğraf değil.");
        }

        row.setText("Hazırlanıyor…");
        const [fullBlob, thumbBlob] = await Promise.all([
          compressImage(file, photoSettings.fullMaxEdge, photoSettings.fullQuality),
          compressImage(file, photoSettings.thumbMaxEdge, photoSettings.thumbQuality)
        ]);

        const slot = await reserveSlot(uploaderName);
        state.uploadCount = Number(slot);
        updateRemaining();
        const photoId = `${state.user.uid}_${slot}`;
        const fullPath = `wedding/full/${state.user.uid}/${slot}.jpg`;
        const thumbPath = `wedding/thumb/${state.user.uid}/${slot}.jpg`;
        const fullRef = ref(storage, fullPath);
        const thumbRef = ref(storage, thumbPath);

        try {
          row.setText("Yükleniyor…");
          await uploadWithProgress(fullRef, fullBlob, uploaderName, slot, (progress) => {
            row.setProgress(progress * 0.82);
          });
          await uploadWithProgress(thumbRef, thumbBlob, uploaderName, slot, (progress) => {
            row.setProgress(82 + progress * 0.16);
          });

          await setDoc(doc(db, "photos", photoId), {
            uid: state.user.uid,
            slot,
            uploaderName,
            originalName: file.name.slice(0, 160),
            fullPath,
            thumbPath,
            fullSize: fullBlob.size,
            thumbSize: thumbBlob.size,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          await Promise.allSettled([deleteObject(fullRef), deleteObject(thumbRef)]);
          throw error;
        }

        successCount += 1;
        row.setProgress(100);
        row.setText("Yüklendi");
        row.element.classList.add("done");
        updateRemaining();
      } catch (error) {
        console.error(error);
        row.setText(firebaseErrorMessage(error));
        row.element.classList.add("failed");
      }
    }

    state.uploading = false;
    updateRemaining();

    if (successCount > 0) {
      showStatus(`${successCount} fotoğraf galeriye eklendi.`, "ok");
    } else {
      showStatus("Fotoğraflar yüklenemedi.", "error");
    }
  }

  async function reserveSlot(uploaderName) {
    if (!state.user) throw new Error("Bağlantı henüz hazır değil.");
    let slotNumber = 0;
    const uploaderRef = doc(db, "uploaders", state.user.uid);

    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(uploaderRef);
      const current = snapshot.exists() ? Number(snapshot.data().uploadCount || 0) : 0;

      if (current >= photoSettings.maxPhotosPerDevice) {
        throw new Error("Bu cihaz için 25 fotoğraf sınırına ulaşıldı.");
      }

      slotNumber = current + 1;
      const data = {
        uploadCount: slotNumber,
        uploaderName,
        updatedAt: serverTimestamp()
      };

      if (snapshot.exists()) {
        transaction.update(uploaderRef, data);
      } else {
        transaction.set(uploaderRef, data);
      }
    });

    return String(slotNumber).padStart(2, "0");
  }

  function subscribeToGallery() {
    if (state.unsubscribe) state.unsubscribe();

    const liveQuery = query(
      collection(db, "photos"),
      orderBy("createdAt", "desc"),
      limit(photoSettings.liveGalleryLimit)
    );

    state.unsubscribe = onSnapshot(liveQuery, (snapshot) => {
      snapshot.docs.forEach((photoDoc) => {
        state.photos.set(photoDoc.id, { id: photoDoc.id, ...photoDoc.data() });
      });
      state.lastVisible = snapshot.docs.at(-1) || state.lastVisible;
      renderGallery();
      elements.loadMore.hidden = snapshot.docs.length < photoSettings.liveGalleryLimit;
    }, (error) => {
      console.error(error);
      showStatus(firebaseErrorMessage(error), "error");
    });
  }

  async function loadMorePhotos() {
    if (!state.lastVisible) return;
    elements.loadMore.disabled = true;
    elements.loadMore.textContent = "Yükleniyor…";

    try {
      const olderQuery = query(
        collection(db, "photos"),
        orderBy("createdAt", "desc"),
        startAfter(state.lastVisible),
        limit(photoSettings.pageSize)
      );
      const snapshot = await getDocs(olderQuery);
      snapshot.docs.forEach((photoDoc) => {
        state.photos.set(photoDoc.id, { id: photoDoc.id, ...photoDoc.data() });
      });
      state.lastVisible = snapshot.docs.at(-1) || state.lastVisible;
      renderGallery();
      elements.loadMore.hidden = snapshot.docs.length < photoSettings.pageSize;
    } catch (error) {
      console.error(error);
      showStatus(firebaseErrorMessage(error), "error");
    } finally {
      elements.loadMore.disabled = false;
      elements.loadMore.textContent = "Daha fazla fotoğraf göster";
    }
  }

  function renderGallery() {
    const sortedPhotos = Array.from(state.photos.values()).sort((a, b) => {
      const bTime = b.createdAt?.toMillis?.() || 0;
      const aTime = a.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    elements.empty.hidden = sortedPhotos.length > 0;
    elements.gallery.innerHTML = "";

    sortedPhotos.forEach((photo) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "photo-card";
      card.setAttribute("aria-label", `${photo.uploaderName || "Misafir"} tarafından yüklenen fotoğrafı aç`);

      const image = document.createElement("img");
      image.alt = `${photo.uploaderName || "Misafir"} tarafından yüklenen düğün fotoğrafı`;
      image.loading = "lazy";
      image.decoding = "async";

      const name = document.createElement("span");
      name.className = "photo-card-name";
      name.textContent = photo.uploaderName || "Misafir";

      card.append(image, name);
      card.addEventListener("click", () => openLightbox(photo));
      elements.gallery.appendChild(card);

      resolveUrl(photo.thumbPath).then((url) => {
        image.src = url;
      }).catch(() => {
        card.classList.add("photo-card-error");
      });
    });
  }

  async function openLightbox(photo) {
    elements.lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    elements.lightboxImage.removeAttribute("src");
    elements.lightboxCaption.textContent = `${photo.uploaderName || "Misafir"} tarafından paylaşıldı`;

    try {
      elements.lightboxImage.src = await resolveUrl(photo.fullPath);
    } catch (error) {
      elements.lightboxCaption.textContent = "Fotoğraf açılamadı.";
    }
  }

  function closeLightbox() {
    elements.lightbox.hidden = true;
    elements.lightboxImage.removeAttribute("src");
    document.body.classList.remove("lightbox-open");
  }

  async function resolveUrl(path) {
    if (state.urlCache.has(path)) return state.urlCache.get(path);
    const promise = getDownloadURL(ref(storage, path));
    state.urlCache.set(path, promise);
    return promise;
  }
}

function createQueueRow(filename) {
  const element = document.createElement("div");
  element.className = "upload-row";

  const top = document.createElement("div");
  top.className = "upload-row-top";

  const name = document.createElement("span");
  name.className = "upload-row-name";
  name.textContent = filename;

  const text = document.createElement("span");
  text.className = "upload-row-status";
  text.textContent = "Bekliyor…";

  const track = document.createElement("div");
  track.className = "upload-progress";

  const bar = document.createElement("span");
  track.appendChild(bar);
  top.append(name, text);
  element.append(top, track);

  return {
    element,
    setText(value) {
      text.textContent = value;
    },
    setProgress(value) {
      bar.style.width = `${Math.max(0, Math.min(100, value))}%`;
    }
  };
}

function uploadWithProgress(storageRef, blob, uploaderName, slot, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumableFn(storageRef, blob, {
      contentType: "image/jpeg",
      cacheControl: "public,max-age=31536000,immutable",
      customMetadata: {
        uploaderName,
        slot
      }
    });

    task.on("state_changed", (snapshot) => {
      const progress = snapshot.totalBytes
        ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        : 0;
      onProgress(progress);
    }, reject, () => resolve(task.snapshot));
  });
}

async function compressImage(file, maxEdge, quality) {
  const image = await decodeImage(file);
  const width = image.width || image.naturalWidth;
  const height = image.height || image.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  if (typeof image.close === "function") image.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Fotoğraf dönüştürülemedi."));
    }, "image/jpeg", quality);
  });

  return blob;
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {
      // Safari/HEIC gibi durumlarda aşağıdaki Image yöntemi denenir.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Bu fotoğraf biçimi tarayıcıda açılamadı."));
      image.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 60);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Istanbul"
  }).format(new Date(value));
}

function showStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.className = `status photo-status ${type}`;
}

function firebaseErrorMessage(error) {
  const code = error?.code || "";
  const messages = {
    "auth/operation-not-allowed": "Firebase'de anonim giriş etkinleştirilmemiş.",
    "auth/network-request-failed": "İnternet bağlantısı kurulamadı.",
    "permission-denied": "Firebase güvenlik kuralları bu işleme izin vermiyor.",
    "storage/unauthorized": "Fotoğraf yükleme izni yok. Storage kurallarını kontrol edin.",
    "storage/quota-exceeded": "Firebase depolama kotası aşıldı.",
    "storage/retry-limit-exceeded": "Yükleme zaman aşımına uğradı; tekrar deneyin.",
    "storage/canceled": "Yükleme iptal edildi."
  };
  return messages[code] || error?.message || "Beklenmeyen bir hata oluştu.";
}
