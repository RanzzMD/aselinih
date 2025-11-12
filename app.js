// ============================================
// CONFIGURATION
// ============================================
const defaultConfig = {
  background_color: "#0b0f1f",
  surface_color: "rgba(18,16,45,0.9)",
  text_color: "#eef1ff",
  primary_action_color: "#8b5cf6",
  secondary_action_color: "#64748b",
  font_family: "Poppins",
  font_size: 17,
  form_title: "Forum Pengajuan Izin Digital",
  form_subtitle: "Lengkapi formulir di bawah ini untuk mengajukan izin",
  submit_button_text: "Kirim Pengajuan"
};

// ============================================
// STATE + FALLBACK STORAGE
// ============================================
let currentRecordCount = 0;
let activeFolder = "SEMUA"; // filter folder aktif (SEMUA atau 'A','B',...)
const LS_KEY = "pengajuan_izin_records_v1";

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveLocal(arr) {
  localStorage.setItem(LS_KEY, JSON.stringify(arr));
}

// ============================================
// TELEGRAM ENDPOINT (optional override)
// ============================================
const TELEGRAM_ENDPOINT = '/api/telegram'; // serverless endpoint (Vercel) - can be overridden by window.TELEGRAM_ENDPOINT_OVERRIDE

// ============================================
// DATA SDK HANDLER (opsional)
// ============================================
const dataHandler = {
  onDataChanged(data) {
    currentRecordCount = data.length;
    renderFolders(data);
    renderSubmissions(data);
  }
};

// ============================================
// ELEMENT SDK - CONFIG CHANGE HANDLER
// ============================================
async function onConfigChange(config = {}) {
  const customFont = config.font_family || defaultConfig.font_family;
  const baseFontStack = "system-ui, -apple-system, sans-serif";
  const baseSize = config.font_size || defaultConfig.font_size;

  const backgroundColor = config.background_color || defaultConfig.background_color;
  const surfaceColor = config.surface_color || defaultConfig.surface_color;
  const textColor = config.text_color || defaultConfig.text_color;
  const primaryColor = config.primary_action_color || defaultConfig.primary_action_color;
  const secondaryColor = config.secondary_action_color || defaultConfig.secondary_action_color;

  document.body.style.background = backgroundColor;
  document.body.style.color = textColor;
  document.body.style.fontFamily = `${customFont}, ${baseFontStack}`;

  const formTitle = document.getElementById("form-title");
  formTitle.textContent = config.form_title || defaultConfig.form_title;
  formTitle.style.fontSize = `${baseSize * 2}px`;
  formTitle.style.color = "#ffffff";
  formTitle.style.fontFamily = `${customFont}, ${baseFontStack}`;

  const formSubtitle = document.getElementById("form-subtitle");
  formSubtitle.textContent = config.form_subtitle || defaultConfig.form_subtitle;
  formSubtitle.style.fontSize = `${baseSize * 1.25}px`;
  formSubtitle.style.color = "#ffffff";
  formSubtitle.style.fontFamily = `${customFont}, ${baseFontStack}`;

  const submitText = document.getElementById("submit-text");
  submitText.textContent = config.submit_button_text || defaultConfig.submit_button_text;

  // Sesuaikan kartu form/list
  document.querySelectorAll(".glass-card").forEach(container => {
    container.style.background = surfaceColor;
  });

  document.querySelectorAll("h2").forEach(heading => {
    heading.style.fontSize = `${baseSize * 1.5}px`;
    heading.style.color = textColor;
    heading.style.fontFamily = `${customFont}, ${baseFontStack}`;
  });

  document.querySelectorAll("label").forEach(label => {
    label.style.fontSize = `${baseSize * 0.875}px`;
    label.style.color = textColor;
    label.style.fontFamily = `${customFont}, ${baseFontStack}`;
  });

  document.querySelectorAll("input, textarea, select").forEach(input => {
    input.style.fontSize = `${baseSize}px`;
    input.style.color = textColor;
    input.style.borderColor = secondaryColor;
    input.style.fontFamily = `${customFont}, ${baseFontStack}`;
  });

  const submitBtn = document.getElementById("submit-btn");
  submitBtn.style.background = primaryColor;
  submitBtn.style.color = "#ffffff";
  submitBtn.style.fontSize = `${baseSize * 1.125}px`;
  submitBtn.style.fontFamily = `${customFont}, ${baseFontStack}`;
}

// ============================================
// HELPERS
// ============================================
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = "toast text-white";
  toast.style.background = type === "success" ? "#22c55e" : "#ef4444";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function toISODateFromParts(y, m, d) {
  const pad = n => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function validateFile(file, maxMB = 5, allowed = []) {
  const okSize = file.size <= maxMB * 1024 * 1024;
  const okType = allowed.length ? allowed.some(a => file.type.includes(a)) : true;
  return okSize && okType;
}

// ============================================
// FOLDER (Grouping) - NEW: group by first letter of nama_lengkap
// ============================================
function firstLetterKey(name) {
  if (!name) return "#";
  // normalize: trim, uppercase first letter, fallback to '#'
  const n = String(name).trim();
  if (!n) return "#";
  const ch = n[0].toUpperCase();
  // keep only A-Z and common locale letters; others go to '#'
  if (/[A-ZÀ-ÖØ-Þ]/i.test(ch)) return ch;
  return "#";
}

function groupByAlpha(data) {
  const map = new Map();
  for (const r of data) {
    const key = firstLetterKey(r.nama_lengkap);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  // Sort entries by key (A-Z), keep '#' at the end
  const entries = [...map.entries()].sort((a, b) => {
    if (a[0] === "#") return 1;
    if (b[0] === "#") return -1;
    return a[0].localeCompare(b[0], 'id');
  });
  return new Map(entries);
}

function renderFolders(data) {
  const wrap = document.getElementById("folders-list");
  if (!wrap) return;

  if (!data || data.length === 0) {
    wrap.innerHTML = `<div class="text-gray-500 text-sm">Belum ada pengajuan</div>`;
    return;
  }

  const groups = groupByAlpha(data);
  const total = data.length;

  const tile = (label, count, active) => `
    <button data-folder="${label}"
      class="px-4 py-3 rounded-xl shadow border text-sm font-semibold transition
             ${active ? "bg-indigo-600 text-white" : "bg-white hover:bg-indigo-50"}">
      <div class="flex items-center gap-2">
        <span>📁</span><span>${label}</span>
        <span class="ml-2 text-xs ${active ? "bg-white/20" : "bg-indigo-100"} rounded-full px-2 py-0.5">
          ${count}
        </span>
      </div>
    </button>
  `;

  // SEMUA tile first
  let html = tile("SEMUA", total, activeFolder === "SEMUA");

  // Iterate groups in alphabetical order (A→Z)
  for (const [key, arr] of groups.entries()) {
    html += tile(key, arr.length, activeFolder === key);
  }
  wrap.innerHTML = `<div class="flex flex-wrap gap-3">${html}</div>`;

  // Klik handler
  wrap.querySelectorAll("button[data-folder]").forEach(btn => {
    btn.addEventListener("click", () => {
      activeFolder = btn.getAttribute("data-folder");
      renderFolders(data); // re-render highlight aktif

      // filter: show all or those whose first letter matches
      const filtered = activeFolder === "SEMUA"
        ? data
        : data.filter(r => firstLetterKey(r.nama_lengkap) === activeFolder);

      renderSubmissions(filtered);
      showSubmissionsCard(activeFolder); // reveal submissions card when folder selected
    });
  });
}

// ============================================
// RENDER SUBMISSIONS
// ============================================
function renderSubmissions(data) {
  const container = document.getElementById("submissions-list");

  if (!data || data.length === 0) {
    container.innerHTML = '<p class="text-center py-8 text-gray-500">Belum ada pengajuan</p>';
    return;
  }

  const cfg = (window.elementSdk && window.elementSdk.config) || {};
  const primary = cfg.primary_action_color || defaultConfig.primary_action_color;
  const textColor = cfg.text_color || defaultConfig.text_color;

  const sortedData = [...data].sort((a, b) =>
    new Date(b.tanggal_pengajuan) - new Date(a.tanggal_pengajuan)
  );

  container.innerHTML = sortedData.map((submission, idx) => `
    <div class="submission-card bg-white rounded-xl p-6 shadow-md" style="border-left-color:${primary}">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="text-xl font-bold" style="color:${textColor}">${submission.nama_lengkap}</h3>
          <p class="text-sm mt-1 opacity-70">NIK: ${submission.nik}</p>
        </div>
        <span class="px-4 py-2 rounded-full text-sm font-bold shadow-sm"
              style="background: linear-gradient(135deg, ${primary}, #64748b); color:white;">
          ${submission.status || "Menunggu"}
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4 bg-gray-50 p-4 rounded-lg">
        <div>
          <span class="font-semibold block mb-1">📍 Tempat, Tanggal Lahir:</span>
          <p>${submission.tempat_lahir}, ${submission.tanggal_lahir ? new Date(submission.tanggal_lahir).toLocaleDateString("id-ID") : ""}</p>
        </div>
        <div>
          <span class="font-semibold block mb-1">📞 Kontak:</span>
          <p>${submission.no_telepon}</p>
          <p>${submission.email}</p>
        </div>
      </div>

      <div class="mb-4 bg-blue-50 p-4 rounded-lg">
        <span class="font-semibold text-sm block mb-2">🏠 Alamat:</span>
        <p class="text-sm">${submission.alamat}</p>
      </div>

      <div class="mb-4 bg-purple-50 p-4 rounded-lg">
        <span class="font-semibold text-sm block mb-2">✍️ Alasan:</span>
        <p class="text-sm whitespace-pre-wrap">${submission.alasan}</p>
      </div>

      <div class="flex flex-wrap items-center gap-3 mt-2">
        ${submission.foto_ktp_url ? `
          <button class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm"
                  data-viewer='{"type":"auto","title":"Foto KTP - ${submission.nama_lengkap}","src":"${(submission.foto_ktp_url||"").replaceAll('"','&quot;')}"}'>
            Lihat Foto KTP
          </button>` : ``}
        ${submission.surat_keterangan_url ? `
          <button class="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm"
                  data-viewer='{"type":"auto","title":"Surat Keterangan - ${submission.nama_lengkap}","src":"${(submission.surat_keterangan_url||"").replaceAll('"','&quot;')}"}'>
            Lihat Surat
          </button>` : ``}
        <span class="text-xs text-gray-500 ml-auto">
          Dikirim: ${submission.tanggal_pengajuan ? new Date(submission.tanggal_pengajuan).toLocaleString("id-ID") : ""}
        </span>
      </div>
    </div>
  `).join("");

  // Delegasi klik tombol viewer
  container.querySelectorAll("button[data-viewer]").forEach(btn => {
    btn.addEventListener("click", () => {
      try {
        const payload = JSON.parse(btn.getAttribute("data-viewer"));
        openViewer(payload.src, payload.title, payload.type);
      } catch (e) {
        console.error(e);
        showToast("Gagal membuka pratinjau.", "error");
      }
    });
  });
}

// ============================================
// VIEWER UTILITIES (assumes openViewer/closeViewer exist in styles or earlier scripts)
// ============================================
function isDataURL(str) {
  return typeof str === "string" && /^data:/.test(str);
}
function getMimeFromDataURL(dataURL) {
  const m = dataURL.match(/^data:([^;]+);/);
  return m ? m[1] : "";
}
async function dataURLToObjectURL(dataURL) {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  return url;
}
async function openViewer(src, title = "Pratinjau Dokumen", forceType = "auto") {
  const backdrop = document.getElementById("viewer-backdrop");
  const modal = document.getElementById("viewer-modal");
  const body = document.getElementById("viewer-body");
  const titleEl = document.getElementById("viewer-title");
  const listCard = document.getElementById("submissions-card");

  // Bersihkan konten sebelumnya
  body.innerHTML = "";
  let currentObjectURL = null;

  let viewType = forceType;
  let viewSrc = src;

  try {
    if (isDataURL(src)) {
      const mime = getMimeFromDataURL(src);
      if (viewType === "auto") {
        if (mime.includes("pdf")) viewType = "pdf";
        else if (mime.startsWith("image/")) viewType = "image";
        else viewType = "download";
      }
      viewSrc = await dataURLToObjectURL(src);
      currentObjectURL = viewSrc;
    } else {
      if (viewType === "auto") {
        if (/\.(pdf)(\?|#|$)/i.test(src)) viewType = "pdf";
        else if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/i.test(src)) viewType = "image";
        else viewType = "download";
      }
    }

    if (viewType === "image") {
      const img = document.createElement("img");
      img.src = viewSrc;
      img.alt = title;
      img.className = "w-full h-full object-contain";
      body.appendChild(img);
    } else if (viewType === "pdf") {
      const iframe = document.createElement("iframe");
      iframe.src = viewSrc;
      iframe.title = title;
      iframe.className = "w-full h-full";
      iframe.setAttribute("loading", "eager");
      body.appendChild(iframe);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "w-full h-full flex items-center justify-center";
      wrap.innerHTML = `
        <a href="${viewSrc}" download class="px-4 py-2 rounded-lg bg-indigo-600 text-white">Unduh Dokumen</a>
      `;
      body.appendChild(wrap);
    }

    titleEl.textContent = title;
    backdrop.classList.remove("hidden");
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    if (listCard) listCard.classList.add("hidden");

    const close = () => {
      backdrop.classList.add("hidden");
      modal.classList.add("hidden");
      document.body.style.overflow = "";
      if (listCard) listCard.classList.remove("hidden");
      body.innerHTML = "";
      if (currentObjectURL) {
        URL.revokeObjectURL(currentObjectURL);
        currentObjectURL = null;
      }
      window.removeEventListener("keydown", onEscClose);
    };
    document.getElementById("viewer-close").onclick = close;
    backdrop.onclick = close;
    window.addEventListener("keydown", onEscClose);
  } catch (err) {
    console.error(err);
    showToast("Tidak dapat menampilkan dokumen.", "error");
  }
}
function onEscClose(e) {
  if (e.key === "Escape") {
    const backdrop = document.getElementById("viewer-backdrop");
    const modal = document.getElementById("viewer-modal");
    if (backdrop && !backdrop.classList.contains("hidden")) {
      backdrop.classList.add("hidden");
      modal.classList.add("hidden");
      document.body.style.overflow = "";
      const body = document.getElementById("viewer-body");
      if (body) body.innerHTML = "";
      if (document.getElementById("submissions-card")) document.getElementById("submissions-card").classList.remove("hidden");
      window.removeEventListener("keydown", onEscClose);
    }
  }
}

// ============================================
// INIT OPTIONS (Tanggal/Bulan/Tahun)
// ============================================
function populateDateSelectors() {
  const tanggal = document.getElementById("tanggal");
  const bulan = document.getElementById("bulan");
  const tahun = document.getElementById("tahun");

  if (!tanggal || !bulan || !tahun) return;

  // tanggal 1..31
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement("option");
    opt.value = String(d).padStart(2, "0");
    opt.textContent = d;
    tanggal.appendChild(opt);
  }

  // tahun (1930..tahun ini)
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= 1930; y--) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = String(y);
    tahun.appendChild(opt);
  }

  function adjustDays() {
    const y = parseInt(tahun.value || thisYear, 10);
    const m = parseInt(bulan.value || "1", 10);
    const daysInMonth = new Date(y, m, 0).getDate();
    const current = tanggal.value;
    tanggal.innerHTML = '<option value="">Tanggal</option>';
    for (let d = 1; d <= daysInMonth; d++) {
      const opt = document.createElement("option");
      opt.value = String(d).padStart(2, "0");
      opt.textContent = d;
      tanggal.appendChild(opt);
    }
    if (current && parseInt(current, 10) <= daysInMonth) {
      tanggal.value = current;
    }
  }
  bulan.addEventListener("change", adjustDays);
  tahun.addEventListener("change", adjustDays);
}

// ============================================
// FILE PREVIEW
// ============================================
function setupFilePreviews() {
  const ktpInput = document.getElementById("foto_ktp");
  const ktpPreview = document.getElementById("ktp-preview");
  const ktpImage = document.getElementById("ktp-image");

  const suratInput = document.getElementById("surat_keterangan");
  const suratPreview = document.getElementById("surat-preview");
  const suratImage = document.getElementById("surat-image");

  if (ktpInput) {
    ktpInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!validateFile(file, 5, ["image"])) {
        showToast("File KTP terlalu besar atau tipe tidak sesuai.", "error");
        ktpInput.value = "";
        ktpPreview.classList.add("hidden");
        return;
      }

      const url = await fileToDataURL(file);
      ktpImage.src = url;
      ktpPreview.querySelector("p").textContent = `Terunggah: ${file.name}`;
      ktpPreview.classList.remove("hidden");
    });
  }

  if (suratInput) {
    suratInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isOK = validateFile(file, 5, ["image", "pdf"]);
      if (!isOK) {
        showToast("File Surat terlalu besar atau tipe tidak sesuai.", "error");
        suratInput.value = "";
        suratPreview.classList.add("hidden");
        return;
      }

      if (file.type.includes("image")) {
        const url = await fileToDataURL(file);
        suratImage.src = url;
        suratPreview.querySelector("p").textContent = `Terunggah: ${file.name}`;
        suratImage.classList.remove("hidden");
      } else {
        suratImage.src = "";
        suratImage.classList.add("hidden");
        suratPreview.querySelector("p").textContent = `Terunggah: ${file.name} (PDF)`;
      }
      suratPreview.classList.remove("hidden");
    });
  }
}

// ============================================
// SUBMIT HANDLER (dengan fallback yang pasti jalan)
// ============================================
async function onSubmit(e) {
  e.preventDefault();

  const btn = document.getElementById("submit-btn");
  const spinner = document.getElementById("submit-spinner");
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove("hidden");

  try {
    const form = e.currentTarget;
    const nama_lengkap = form.nama_lengkap.value.trim();
    const nik = form.nik.value.trim();
    const tempat_lahir = form.tempat_lahir.value.trim();
    const d = form.tanggal.value;
    const m = form.bulan.value;
    const y = form.tahun.value;
    const alamat = form.alamat.value.trim();
    const no_telepon = form.no_telepon.value.trim();
    const email = form.email.value.trim();
    const alasan = form.alasan.value.trim();

    if (!nama_lengkap || !nik || !tempat_lahir || !d || !m || !y || !alamat || !no_telepon || !email || !alasan) {
      showToast("Lengkapi semua kolom wajib.", "error");
      return;
    }

    const ktpFile = form.foto_ktp.files?.[0];
    const suratFile = form.surat_keterangan.files?.[0];
    if (!ktpFile || !suratFile) {
      showToast("Mohon unggah semua lampiran yang diperlukan.", "error");
      return;
    }

    if (!validateFile(ktpFile, 5, ["image"]) || !validateFile(suratFile, 5, ["image", "pdf"])) {
      showToast("Validasi file gagal. Periksa ukuran/tipe berkas.", "error");
      return;
    }

    const foto_ktp_url = await fileToDataURL(ktpFile);
    const surat_keterangan_url = await fileToDataURL(suratFile);

    const record = {
      nama_lengkap,
      nik,
      tempat_lahir,
      tanggal_lahir: toISODateFromParts(y, m, d),
      alamat,
      no_telepon,
      email,
      alasan,
      foto_ktp_url,
      surat_keterangan_url,
      status: "Menunggu",
      tanggal_pengajuan: new Date().toISOString()
    };

    // PRIORITAS: coba via SDK dulu, jika gagal -> fallback local tetap sukses
    let savedVia = "local";
    if (window.dataSdk && typeof window.dataSdk.create === "function") {
      try {
        await window.dataSdk.create(record);
        savedVia = "sdk";
      } catch (sdkErr) {
        const list = loadLocal();
        list.push(record);
        saveLocal(list);
        console.warn("SDK create gagal, fallback local:", sdkErr);
      }
    } else {
      const list = loadLocal();
      list.push(record);
      saveLocal(list);
    }

    // Refresh tampilan (ambil dari sumber yang ada)
    if (savedVia === "sdk" && window.dataSdk) {
      if (typeof window.dataSdk.list === "function") {
        try {
          const data = await window.dataSdk.list();
          renderFolders(data);
          renderSubmissions(data);
        } catch {
          const local = loadLocal();
          renderFolders(local);
          renderSubmissions(local);
        }
      }
    } else {
      const local = loadLocal();
      renderFolders(local);
      renderSubmissions(local);
    }

    showToast(savedVia === "sdk" ? "Pengajuan berhasil dikirim (SDK)." : "Pengajuan berhasil disimpan (local).");

    // Kirim ke Telegram endpoint (best-effort, no UI change)
    try {
      (async () => {
        await fetch((window.TELEGRAM_ENDPOINT_OVERRIDE) || TELEGRAM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record)
        });
      })();
    } catch (tgErr) {
      console.warn("Telegram notify failed:", tgErr);
    }

    // Reset form & preview
    form.reset();
    const ktpPrev = document.getElementById("ktp-preview");
    const suratPrev = document.getElementById("surat-preview");
    if (ktpPrev) ktpPrev.classList.add("hidden");
    if (suratPrev) suratPrev.classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("Terjadi kesalahan saat mengirim pengajuan.", "error");
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add("hidden");
  }
}

// ============================================
// SHOW SUBMISSIONS CARD HELPER
// ============================================
function showSubmissionsCard(folderLabel = "") {
  const card = document.getElementById("submissions-card");
  if (card) card.classList.remove("hidden");
  const heading = card ? card.querySelector("h2.section-header") : null;
  if (heading) {
    heading.textContent = folderLabel && folderLabel !== "SEMUA"
      ? `📊 Daftar Pengajuan — ${folderLabel}`
      : "📊 Daftar Pengajuan";
  }
}

// ============================================
// BOOTSTRAP
// ============================================
function bootstrap() {
  populateDateSelectors();
  setupFilePreviews();

  const form = document.getElementById("submission-form");
  if (form) form.addEventListener("submit", onSubmit);

  // Inisialisasi tampilan awal dari local (agar tidak blank)
  const existing = loadLocal();
  renderFolders(existing);
  renderSubmissions(existing);

  // Keep submissions hidden until folder chosen (if the DOM had been set that way)
  try { document.getElementById('submissions-card').classList.add('hidden'); } catch {}

  // Apply default config
  onConfigChange(defaultConfig);

  // Integrasi elementSdk bila tersedia
  if (window.elementSdk) {
    try {
      if (typeof window.elementSdk.on === "function") {
        window.elementSdk.on("configChanged", onConfigChange);
      } else if (window.elementSdk.config) {
        onConfigChange(window.elementSdk.config);
      }
    } catch (e) {
      console.warn("elementSdk integration warning:", e);
    }
  }

  // Integrasi dataSdk bila tersedia
  if (window.dataSdk) {
    try {
      if (typeof window.dataSdk.subscribe === "function") {
        window.dataSdk.subscribe((data) => {
          dataHandler.onDataChanged(data);
        });
      } else if (typeof window.dataSdk.list === "function") {
        window.dataSdk.list().then(dataHandler.onDataChanged).catch(() => {});
      }
    } catch (e) {
      console.warn("dataSdk integration warning:", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);
