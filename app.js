// app.js (ESM module)

// =======================
// 1) FIREBASE SETUP
// =======================
// Firebase v9 modular via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// >>> GANTI ini pakai config dari Firebase Console (Project settings -> Your apps -> Web app)
const firebaseConfig = {
  apiKey: "ISI_API_KEY",
  authDomain: "ISI_AUTH_DOMAIN",
  projectId: "ISI_PROJECT_ID",
  storageBucket: "ISI_STORAGE_BUCKET",
  messagingSenderId: "ISI_SENDER_ID",
  appId: "ISI_APP_ID",
};

const ADMIN_EMAIL = "dinijanuari23@gmail.com";

// Firestore doc untuk status toko (global)
const STORE_DOC_PATH = ["settings", "store"]; // collection: settings, doc: store

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let storeOpen = true; // default
let isAdmin = false;

// =======================
// 2) UTIL UI
// =======================
function sanitize(v){return v?Number(String(v).replace(/\D+/g,'')):NaN;}

function fill({nmText,hgRaw,ktVal}) {
  document.getElementById('nm').value = nmText||'';
  document.getElementById('kt').value = ktVal||'';
  const h = sanitize(hgRaw);
  document.getElementById('hg').value = !isNaN(h) ? 'Rp'+new Intl.NumberFormat('id-ID').format(h) : hgRaw;
  const el = document.querySelector('.form-container') || document.getElementById('orderSection');
  if(el){
    el.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(()=> document.getElementById('usr').focus(), 200);
  }
}

function showValidationPopupCenter(message){
  const existing = document.getElementById('validationCenterPopup');
  if(existing) existing.remove();
  const container = document.getElementById('validationContainer') || document.body;
  const popup = document.createElement('div');
  popup.id = 'validationCenterPopup';
  popup.className = 'validation-center';
  popup.tabIndex = -1;
  popup.innerHTML = `<div class="txt">${message}</div><button class="xbtn" aria-label="Tutup">✕</button>`;
  container.appendChild(popup);
  const closeBtn = popup.querySelector('.xbtn');
  popup.focus({preventScroll:true});
  function removePopup(){
    popup.style.transition = 'opacity 160ms ease, transform 160ms ease';
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%,-50%) scale(.98)';
    setTimeout(()=> popup.remove(), 170);
  }
  closeBtn.addEventListener('click', removePopup);
  const t = setTimeout(removePopup, 4000);
  window.addEventListener('pagehide', ()=>{ clearTimeout(t); if(popup) popup.remove(); }, { once:true });
}

function applyStoreStatusUI(){
  const bar = document.getElementById('serviceStatusBar');
  const txt = document.getElementById('serviceStatusText');
  const sub = document.getElementById('serviceStatusSub');

  if(bar && txt && sub){
    bar.classList.remove('open','closed');
    if(storeOpen){
      bar.classList.add('open');
      txt.textContent = 'Layanan OPEN';
      sub.textContent = 'Silakan lanjutkan pemesanan.';
    } else {
      bar.classList.add('closed');
      txt.textContent = 'Layanan CLOSED';
      sub.textContent = 'Mohon maaf, layanan sedang tutup. Silahkan pesan saat sudah memasuki jam kerja';
    }
  }

  // tombol pesan: disable kalau tutup
  const btn = document.getElementById('btnTg');
  if(btn){
    btn.disabled = !storeOpen;
  }

  // admin badge
  const badge = document.getElementById('adminBadge');
  if(badge){
    badge.textContent = storeOpen ? 'OPEN' : 'CLOSED';
    badge.style.borderColor = storeOpen ? '#bbf7d0' : '#fecaca';
    badge.style.background = storeOpen ? '#ecfdf5' : '#fef2f2';
    badge.style.color = storeOpen ? '#14532d' : '#7f1d1d';
  }
}

function applyAdminUI(user){
  const panel = document.getElementById('adminPanel');
  const btnLogin = document.getElementById('btnAdminLogin');
  const btnLogout = document.getElementById('btnAdminLogout');
  const emailEl = document.getElementById('adminEmail');
  const btnSetOpen = document.getElementById('btnSetOpen');
  const btnSetClose = document.getElementById('btnSetClose');

  if(!panel || !btnLogin || !btnLogout || !emailEl || !btnSetOpen || !btnSetClose) return;

  // panel hanya muncul kalau admin
  if(isAdmin){
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }

  // tombol login/logout (lebih untuk debug, tapi tetap aman)
  if(user){
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-block';
    emailEl.textContent = user.email || '';
  } else {
    btnLogin.style.display = 'inline-block';
    btnLogout.style.display = 'none';
    emailEl.textContent = '';
  }

  // tombol open/close hanya aktif untuk admin
  btnSetOpen.disabled = !isAdmin;
  btnSetClose.disabled = !isAdmin;
}

async function setStoreOpen(flag){
  if(!isAdmin){
    showValidationPopupCenter('Akses ditolak. Hanya admin yang bisa mengubah status.');
    return;
  }
  const ref = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  await setDoc(ref, { open: !!flag, updatedAt: serverTimestamp() }, { merge: true });
}

// =======================
// 3) ORIGINAL LOGIC + FIREBASE LISTENERS
// =======================
document.addEventListener('DOMContentLoaded', function(){

  // Click price cards fill form
  document.querySelectorAll('.bc').forEach(b=>{
    b.addEventListener('click', ()=> fill({
      nmText: b.getAttribute('data-nm') || b.textContent.trim(),
      hgRaw: b.getAttribute('data-hg') || '',
      ktVal: b.getAttribute('data-kt') || ''
    }));
  });

  // V2L dynamic fields
  const v2 = document.getElementById('v2');
  const v2m = document.getElementById('v2m');
  const v2mDiv = document.getElementById('v2m_div');
  const bcDiv = document.getElementById('bc_div');
  const emDiv = document.getElementById('em_div');
  const bcInput = document.getElementById('bc');

  function updateV2Requirements(){
    if(v2.value === 'ON'){
      v2mDiv.classList.remove('hidden');
      v2m.required = true;
    } else {
      v2mDiv.classList.add('hidden');
      v2m.value = '';
      v2m.required = false;
      bcDiv.classList.add('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = false;
    }
  }

  function updateV2mRequirements(){
    if(v2m.value === 'BC'){
      bcDiv.classList.remove('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = true;
    } else if(v2m.value === 'EM'){
      emDiv.classList.remove('hidden');
      bcDiv.classList.add('hidden');
      bcInput.required = false;
      bcInput.value = '';
    } else {
      bcDiv.classList.add('hidden');
      emDiv.classList.add('hidden');
      bcInput.required = false;
      bcInput.value = '';
    }
  }

  v2.addEventListener('change', updateV2Requirements);
  v2m.addEventListener('change', updateV2mRequirements);

  updateV2Requirements();
  updateV2mRequirements();

  // =======================
  // FIRESTORE: LISTEN STORE STATUS (GLOBAL)
  // =======================
  const storeRef = doc(db, STORE_DOC_PATH[0], STORE_DOC_PATH[1]);
  onSnapshot(storeRef, (snap) => {
    if(snap.exists()){
      const data = snap.data();
      storeOpen = (data.open !== false); // default true if missing
    } else {
      storeOpen = true;
    }
    applyStoreStatusUI();
  }, (err) => {
    // kalau Firestore error, default OPEN biar tidak mati total
    storeOpen = true;
    applyStoreStatusUI();
  });

  // =======================
  // AUTH: ADMIN ONLY
  // =======================
  onAuthStateChanged(auth, (user) => {
    isAdmin = !!(user && (user.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
    applyAdminUI(user);

    // kalau login tapi bukan admin, auto logout supaya panel tak bisa dipakai
    if(user && !isAdmin){
      signOut(auth).catch(()=>{});
      showValidationPopupCenter('Email ini bukan admin.');
    }
  });

  // Login/Logout handlers
  const btnLogin = document.getElementById('btnAdminLogin');
  const btnLogout = document.getElementById('btnAdminLogout');
  if(btnLogin){
    btnLogin.addEventListener('click', async ()=>{
      try{
        await signInWithPopup(auth, provider);
      } catch(e){
        showValidationPopupCenter('Login dibatalkan / gagal.');
      }
    });
  }
  if(btnLogout){
    btnLogout.addEventListener('click', async ()=>{
      try{ await signOut(auth); } catch(e){}
    });
  }

  // Admin open/close
  const btnSetOpen = document.getElementById('btnSetOpen');
  const btnSetClose = document.getElementById('btnSetClose');
  if(btnSetOpen) btnSetOpen.addEventListener('click', ()=> setStoreOpen(true));
  if(btnSetClose) btnSetClose.addEventListener('click', ()=> setStoreOpen(false));

  // =======================
  // BTN PESAN
  // =======================
  document.getElementById('btnTg').addEventListener('click', ()=>{
    // STOP kalau layanan tutup
    if(!storeOpen){
      showValidationPopupCenter('Mohon maaf, layanan sedang tutup. Silahkan pesan saat sudah memasuki jam kerja');
      return;
    }

    const f = document.getElementById('frm');

    // check built-in required fields first
    const req = f.querySelectorAll('input[required], select[required]');
    for(const i of req){
      if(!String(i.value || '').trim()){
        showValidationPopupCenter('harap isi semua kolom yang diwajibkan!');
        try{ i.focus(); }catch(e){}
        return;
      }
    }

    // Additional logic: if V2L ON, ensure metode dipilih
    if(v2.value === 'ON'){
      if(!v2m.value){
        showValidationPopupCenter('Pilih metode V2L terlebih dahulu.');
        v2m.focus();
        return;
      }
      if(v2m.value === 'BC'){
        const bcVal = bcInput.value || '';
        if(!bcVal.trim()){
          showValidationPopupCenter('Masukkan Backup Code saat memilih metode Backup Code.');
          bcInput.focus();
          return;
        }
      }
    }

    const u = document.getElementById('usr').value;
    const p = document.getElementById('pwd').value;
    const v = v2.value;
    const vm = v2m.value;
    const b = bcDiv.querySelector('input')?.value || '';
    const kt = document.getElementById('kt').value;
    const nm = document.getElementById('nm').value;
    const hg = document.getElementById('hg').value;

    // =======================
    // TELEGRAM SEND (FRONTEND VERSION - TIDAK AMAN)
    // Disarankan ganti pakai Firebase Functions (aku kasih setup di bawah)
    // =======================
    const token = '1868293159:AAF7IWMtOEqmVqEkBAfCTexkj_siZiisC0E';
    const chatId = '-1002801058966';

    function removeUrlsAndGithub(s){
      if(!s) return '';
      s = s.replace(/https?:\/\/\S+/gi, '');
      s = s.replace(/www\.\S+/gi, '');
      s = s.replace(/\b\S*github\S*\b/gi, '');
      s = s.replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g,' ');
      return s.trim();
    }

    let txt = 'Pesanan Baru Masuk!\n\n'
      + 'Username: ' + u + '\n'
      + 'Password: ' + p + '\n'
      + 'V2L: ' + v + (vm ? ' (' + vm + ')' : '')
      + (b ? '\nBackup Code: ' + b : '')
      + '\nKategori: ' + kt
      + '\nNominal: ' + nm
      + '\nHarga: ' + hg;

    txt = removeUrlsAndGithub(txt);

    fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
      method:'POST',
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({chat_id:chatId, text:txt})
    })
    .then(res=>{
      if(res.ok){
        const qrUrl = "https://payment.uwu.ai/assets/images/gallery03/8555ed8a_original.jpg?v=58e63277";
        showPaymentPopup(qrUrl, hg);
        f.reset();
        updateV2Requirements();
        updateV2mRequirements();
      } else {
        alert('Gagal kirim ke Telegram');
      }
    })
    .catch(()=> alert('Terjadi kesalahan.'));
  });

  // =======================
  // PAYMENT POPUP
  // =======================
  function showPaymentPopup(qrUrl, hargaFormatted){
    const backdrop = document.getElementById('paymentModalBackdrop');
    const modalQr = document.getElementById('modalQr');
    const modalAmount = document.getElementById('modalAmount');
    const copySuccess = document.getElementById('copySuccess');

    const walletLabel = document.getElementById('walletLabel');
    const walletNumberTitle = document.getElementById('walletNumberTitle');
    const walletNumber = document.getElementById('walletNumber');
    const walletNumberWrapper = document.getElementById('walletNumberWrapper');
    const walletNote = document.getElementById('walletNote');
    const copyNumberBtn = document.getElementById('copyNumberBtn');

    const methodButtons = document.querySelectorAll('.method-btn');
    const copyAmountBtn = document.getElementById('copyAmountBtn');

    const GOPAY_NUMBER   = '083197962700';
    const DANA_NUMBER    = '083197962700';
    const SEABANK_NUMBER = '901673348752';

    const baseAmount = (function () {
      const num = Number(String(hargaFormatted).replace(/[^\d]/g, ''));
      return isNaN(num) ? 0 : num;
    })();

    function formatRupiah(num) {
      return "Rp" + new Intl.NumberFormat('id-ID').format(num);
    }

    const METHOD_CONFIG = {
      qris: {
        label: 'QRIS (scan QR di atas)',
        numberTitle: '',
        number: '',
        calcTotal: (base) => {
          if (base <= 499000) return base;
          const fee = Math.round(base * 0.003); // 0.3%
          return base + fee;
        },
        note: 'QRIS hingga Rp499.000 tidak ada biaya tambahan. Di atas itu akan dikenakan biaya 0,3% dari nominal.',
        showNumber: false
      },
      gopay: {
        label: 'Transfer GoPay ke GoPay',
        numberTitle: 'No HP GoPay',
        number: GOPAY_NUMBER,
        calcTotal: (base) => base,
        note: 'Pembayaran GoPay tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.',
        showNumber: true
      },
      seabank: {
        label: 'Transfer SeaBank',
        numberTitle: 'No rekening SeaBank',
        number: SEABANK_NUMBER,
        calcTotal: (base) => base,
        note: 'SeaBank tidak ada biaya tambahan. Bayar sesuai nominal yang tertera.',
        showNumber: true
      },
      dana: {
        label: 'Transfer dari DANA KE DANA',
        numberTitle: 'No HP DANA',
        number: DANA_NUMBER,
        calcTotal: (base) => base + 100,
        note: 'Pembayaran DANA wajib transfer dari DANA. Dikenakan biaya admin Rp100. Total sudah termasuk biaya admin.',
        showNumber: true
      }
    };

    function showMessage(msg) {
      copySuccess.textContent = msg;
      copySuccess.style.display = 'block';
      setTimeout(()=> copySuccess.style.display = 'none', 2500);
    }

    function copyTextToClipboard(text, successMsg) {
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          showMessage(successMsg);
        }).catch(() => {
          const tmp = document.createElement('textarea');
          tmp.value = text;
          document.body.appendChild(tmp);
          tmp.select();
          try {
            document.execCommand('copy');
            showMessage(successMsg);
          } catch(e) {
            showMessage('Tidak dapat menyalin, silakan salin manual.');
          }
          document.body.removeChild(tmp);
        });
      } else {
        const tmp = document.createElement('textarea');
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        try {
          document.execCommand('copy');
          showMessage(successMsg);
        } catch(e) {
          showMessage('Tidak dapat menyalin, silakan salin manual.');
        }
        document.body.removeChild(tmp);
      }
    }

    function applyMethod(methodKey) {
      methodButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.method === methodKey);
      });

      const cfg = METHOD_CONFIG[methodKey];

      walletLabel.textContent = cfg.label;
      walletNote.textContent = cfg.note;

      const total = cfg.calcTotal(baseAmount);
      modalAmount.textContent = formatRupiah(total);

      if (cfg.showNumber) {
        walletNumberTitle.textContent = cfg.numberTitle;
        walletNumber.textContent = cfg.number;
        walletNumberWrapper.style.display = 'block';
        copyNumberBtn.style.display = 'block';
      } else {
        walletNumberWrapper.style.display = 'none';
        copyNumberBtn.style.display = 'none';
      }

      if (methodKey === 'qris') {
        modalQr.style.display = 'block';
        modalQr.src = qrUrl;
      } else {
        modalQr.style.display = 'none';
      }
    }

    applyMethod('qris');

    copySuccess.style.display = 'none';
    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden','false');

    methodButtons.forEach(btn => {
      btn.onclick = function () {
        applyMethod(this.dataset.method);
      };
    });

    document.getElementById('closeModalBtn').onclick = function(){
      backdrop.style.display = 'none';
      backdrop.setAttribute('aria-hidden','true');
    };
    backdrop.onclick = function(e){
      if(e.target === backdrop){
        backdrop.style.display = 'none';
        backdrop.setAttribute('aria-hidden','true');
      }
    };

    copyNumberBtn.onclick = function () {
      copyTextToClipboard(walletNumber.textContent || '', 'Nomor berhasil disalin');
    };

    copyAmountBtn.onclick = function(){
      copyTextToClipboard(modalAmount.textContent || '', 'Jumlah berhasil disalin');
    };

    document.getElementById('openBotBtn').onclick = function(){
      const botUsername = 'topupgamesbot';
      const tgScheme = 'tg://resolve?domain=' + encodeURIComponent(botUsername);
      const webLink  = 'https://t.me/' + encodeURIComponent(botUsername) + '?start';
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      let appOpened = false;
      function onVisibilityChange(){ if(document.hidden) appOpened = true; }
      document.addEventListener('visibilitychange', onVisibilityChange);

      try {
        if(isMobile){
          window.location.href = tgScheme;
        } else {
          const newWin = window.open(tgScheme, '_blank');
          if(newWin){ try{ newWin.focus(); }catch(e){} }
        }
      } catch(e){}

      const fallbackTimeout = setTimeout(function(){
        if(!appOpened){
          window.open(webLink, '_blank');
        }
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }, 800);

      window.addEventListener('pagehide', function cleanup(){
        clearTimeout(fallbackTimeout);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('pagehide', cleanup);
      });
    };
  }
});
