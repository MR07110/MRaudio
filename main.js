import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, startAfter, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAoPSkghk-1Kff_f5ystj0qQYF2xSgSRk",
  authDomain: "bingo-9c6ee.firebaseapp.com",
  databaseURL: "https://bingo-9c6ee-default-rtdb.firebaseio.com",
  projectId: "bingo-9c6ee",
  storageBucket: "bingo-9c6ee.firebasestorage.app",
  messagingSenderId: "863175962665",
  appId: "1:863175962665:web:e3c9a8b628375ffc0c6c38",
  measurementId: "G-1N8P9GVMFP"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- GLOBAL STATE ---
let mediaRecorder, chunks = [], activeBlob, timerInterval;
let audioCtx = null;
let currentAudio = null;      
let currentPlayingId = null;   
let lastLoadToken = null;
let isDragging = false; 

let lastVisibleDoc = null;
let isFetchingList = false;
let hasMoreDocs = true;

// --- YORDAMCHI FUNKSIYA (VAQTNI FORMATLASH) ---
const formatTime = (s) => {
  if (!s || isNaN(s)) return "00:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// --- 0. NAVIGATSIYA & THEME ---
window.switchPage = (btn, pageId) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  btn.classList.add('active');
};

window.toggleTheme = () => {
  const body = document.body;
  const icon = document.getElementById('theme-icon');
  body.classList.toggle('dark-theme');
  
  if(body.classList.contains('dark-theme')) {
    icon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
  } else {
    icon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
  }
};

// --- 1. LIST LOAD ---
async function loadAudioList(isNext = false) {
  if (isFetchingList || !hasMoreDocs) return;
  isFetchingList = true;
  const indicator = document.getElementById('load-more-indicator');
  if (indicator) indicator.style.display = 'block';

  try {
    let q = query(collection(db, "audios"), orderBy("at", "desc"), limit(10));
    if (isNext && lastVisibleDoc) {
      q = query(collection(db, "audios"), orderBy("at", "desc"), startAfter(lastVisibleDoc), limit(5));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMoreDocs = false;
    } else {
      lastVisibleDoc = snap.docs[snap.docs.length - 1];
      const list = document.getElementById('audio-list');
      snap.forEach(d => {
        if (!document.getElementById(`card-${d.id}`)) {
          list.appendChild(renderCard(d.id, d.data()));
        }
      });
      // Ro'yxat yuklangach Deep Linkni tekshirish
      handleDeepLink();
    }
  } catch (e) { console.error("Firebase error:", e); }
  if (indicator) indicator.style.display = 'none';
  isFetchingList = false;
}

loadAudioList();

window.addEventListener('scroll', () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 300) {
    loadAudioList(true);
  }
});

function renderCard(id, data) {
  const div = document.createElement('div');
  div.className = "audio-card";
  div.id = `card-${id}`;
  div.innerHTML = `
    <div class="card-meta">
      <h4>${data.name || 'MRAI Audio'}</h4>
      <p>${data.at?.toDate ? new Date(data.at.toDate()).toLocaleTimeString() : ''} • ${data.size}</p>
    </div>
    <div class="waveform-visualizer" id="wf-${id}">
      ${Array(50).fill('<div class="w-bar"></div>').join('')}
    </div>
    <div id="time-${id}" class="time-display" style="font-size: 11px; color: var(--text-sec); text-align: right; margin-bottom: 5px; font-family: monospace;">00:00 / 00:00</div>
    <div class="progress-box" id="pbox-${id}">
      <div class="progress-fill" id="pf-${id}"></div>
    </div>
    <div class="controls">
      <button class="btn-svg" id="loop-btn-${id}"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg></button>
      <button class="btn-svg" id="prev-btn-${id}"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg></button>
      <button class="btn-svg btn-play" id="play-btn-${id}">
        <svg class="svg-icon" id="ic-${id}" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="btn-svg" id="next-btn-${id}"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg></button>
      <button class="btn-svg" id="share-btn-${id}"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg></button>
    </div>
  `;

  div.querySelector(`#play-btn-${id}`).onclick = (e) => window.playAudio(id, e.currentTarget, data);
  div.querySelector(`#pbox-${id}`).onmousedown = (e) => window.playAudio.seek(e, id);
  div.querySelector(`#pbox-${id}`).ontouchstart = (e) => window.playAudio.seek(e, id);
  div.querySelector(`#loop-btn-${id}`).onclick = (e) => window.playAudio.toggleLoop(id, e.currentTarget);
  div.querySelector(`#prev-btn-${id}`).onclick = () => window.playAudio.skip(id, -10);
  div.querySelector(`#next-btn-${id}`).onclick = () => window.playAudio.skip(id, 10);
  div.querySelector(`#share-btn-${id}`).onclick = () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#card-${id}`;
    if (navigator.share) {
      navigator.share({ title: data.name, text: "MR Audio-da tinglang:", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
      alert("Havola nusxalandi!");
    }
  };

  return div;
}

// --- 2. DEEP LINK HANDLER ---
const handleDeepLink = () => {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#card-')) {
    const target = document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.transition = "box-shadow 0.5s";
      target.style.boxShadow = "0 0 20px var(--spotify-green)";
      setTimeout(() => target.style.boxShadow = "none", 3000);
      // Agar avtomatik qo'shish kerak bo'lsa: window.location.hash = "";
    }
  }
};

// --- 3. PLEYER NAZORATI ---
window.playAudio = async (id, btn, cardData) => {
  const icon = document.getElementById(`ic-${id}`);
  const bars = document.querySelectorAll(`#wf-${id} .w-bar`);
  const fill = document.getElementById(`pf-${id}`);
  const timeEl = document.getElementById(`time-${id}`);

  if (currentPlayingId === id && currentAudio) {
    if (currentAudio.paused) {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      currentAudio.play();
      icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      startViz(currentAudio, currentAudio.anz, currentAudio.dat, id, bars, fill);
    } else {
      currentAudio.pause();
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
    return;
  }

  if (currentAudio) { 
    currentAudio.pause(); 
    currentAudio.src = ""; 
    currentAudio.load(); 
  }

  if (currentPlayingId) {
    const oldIcon = document.getElementById(`ic-${currentPlayingId}`);
    if (oldIcon) oldIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    const oldSpin = document.getElementById(`spin-${currentPlayingId}`);
    if (oldSpin) oldSpin.remove();
    const oldFill = document.getElementById(`pf-${currentPlayingId}`);
    if (oldFill) oldFill.style.width = "0%";
    const oldTime = document.getElementById(`time-${currentPlayingId}`);
    if (oldTime) oldTime.innerText = "00:00 / 00:00";
    document.querySelectorAll(`#wf-${currentPlayingId} .w-bar`).forEach(b => { 
      b.classList.remove('active'); 
      b.style.height = "5px"; 
    });
  }

  const myToken = Date.now();
  lastLoadToken = myToken;
  currentPlayingId = id;

  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.id = `spin-${id}`;
  btn.appendChild(spinner);
  icon.style.display = 'none';

  try {
    const snap = await getDocs(query(collection(db, `audios/${id}/chunks`), orderBy("idx")));
    if (lastLoadToken !== myToken) return;

    let b64 = ""; snap.forEach(c => b64 += c.data().data);
    const audio = new Audio(b64);
    currentAudio = audio;

    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const source = audioCtx.createMediaElementSource(audio);
    const analyzer = audioCtx.createAnalyser();
    source.connect(analyzer); analyzer.connect(audioCtx.destination);
    analyzer.fftSize = 128;
    const data = new Uint8Array(analyzer.frequencyBinCount);

    audio.anz = analyzer; audio.dat = data;
    
    audio.onloadedmetadata = () => {
      if (timeEl) timeEl.innerText = `00:00 / ${formatTime(audio.duration)}`;
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: cardData.name || 'MRAI Audio',
          artist: 'MR Audio Player',
          artwork: [{ src: 'https://cdn-icons-png.flaticon.com/512/3659/3659744.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      }
    };

    if (spinner) spinner.remove();
    icon.style.display = 'block';
    icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    
    audio.play(); 
    startViz(audio, analyzer, data, id, bars, fill);
    
    audio.onended = () => { 
      if (currentPlayingId === id) { 
        icon.innerHTML = '<path d="M8 5v14l11-7z"/>'; 
        fill.style.width = "0%"; 
        bars.forEach(b => { b.classList.remove('active'); b.style.height = "5px"; }); 
      } 
    };
  } catch(err) { 
    console.error(err); 
    if (spinner) spinner.remove(); 
    icon.style.display = 'block'; 
  }
};

function startViz(audio, analyzer, dataArray, id, bars, fill) {
  const timeEl = document.getElementById(`time-${id}`);
  let lastSec = -1;

  function draw() {
    if (!audio.paused && currentPlayingId === id) {
      requestAnimationFrame(draw);
      analyzer.getByteFrequencyData(dataArray);
      
      const currentSec = Math.floor(audio.currentTime);
      if (timeEl && currentSec !== lastSec) {
        lastSec = currentSec;
        timeEl.innerText = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
        timeEl.classList.remove('time-update');
        void timeEl.offsetWidth; 
        timeEl.classList.add('time-update');
      }

      const center = Math.floor(bars.length / 2);
      bars.forEach((b, i) => {
        const dist = Math.abs(i - center);
        let h = (dataArray[dist % dataArray.length] / 3) + 5;
        b.style.height = Math.max(5, h * (1 - (dist / center) * 0.7)) + "px";
        b.classList.add('active');
      });
      if (!isDragging) fill.style.width = (audio.currentTime / audio.duration) * 100 + "%";
    }
  }
  draw();
}

// --- 4. SEEKING & STUDIO ---
window.playAudio.seek = (e, id) => {
  if (currentPlayingId !== id || !currentAudio || !currentAudio.duration) return;
  const box = document.getElementById(`pbox-${id}`);
  const fill = document.getElementById(`pf-${id}`);
  
  const update = (clientX) => {
    const rect = box.getBoundingClientRect();
    let p = (clientX - rect.left) / rect.width;
    p = Math.max(0, Math.min(1, p));
    fill.style.width = (p * 100) + "%";
    currentAudio.currentTime = p * currentAudio.duration;
  };

  const onMove = (me) => { isDragging = true; update(me.touches ? me.touches[0].clientX : me.clientX); };
  const onStop = () => { isDragging = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('touchmove', onMove); };
  
  update(e.touches ? e.touches[0].clientX : e.clientX);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onStop, { once: true });
  window.addEventListener('touchend', onStop, { once: true });
};

window.playAudio.skip = (id, sec) => { if (currentPlayingId === id && currentAudio) currentAudio.currentTime += sec; };
window.playAudio.toggleLoop = (id, btn) => { if (currentPlayingId === id && currentAudio) { currentAudio.loop = !currentAudio.loop; btn.classList.toggle('loop-active', currentAudio.loop); } };

window.handleRecord = async () => {
  const btn = document.getElementById('rec-trigger');
  const sViz = document.getElementById('studio-viz');
  
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      studioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(studioStream);
      const sCtx = new AudioContext();
      const sSrc = sCtx.createMediaStreamSource(studioStream);
      studioAnz = sCtx.createAnalyser();
      sSrc.connect(studioAnz);
      studioAnz.fftSize = 64;
      studioData = new Uint8Array(studioAnz.frequencyBinCount);
      
      sViz.innerHTML = Array(30).fill('<div class="s-bar"></div>').join('');
      const sBars = sViz.querySelectorAll('.s-bar');
      
      function drawStudio() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          requestAnimationFrame(drawStudio);
          studioAnz.getByteFrequencyData(studioData);
          sBars.forEach((b, i) => {
            let h = (studioData[i % studioData.length] / 2.5) + 4;
            b.style.height = h + "px";
            b.style.background = "var(--ios-red)";
          });
        }
      }

      chunks = [];
      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = () => { 
          activeBlob = new Blob(chunks, { type: 'audio/webm' }); 
          document.getElementById('save-cloud').style.display = 'block';
          studioStream.getTracks().forEach(t => t.stop());
      };
      
      mediaRecorder.start(); startTimer(); drawStudio();
      btn.innerHTML = '<svg class="svg-icon" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" style="fill:var(--ios-red)"/></svg>';
    } catch (e) { alert("Mikrofon ruxsati kerak!"); }
  } else {
    mediaRecorder.stop(); clearInterval(timerInterval);
    btn.innerHTML = '<svg class="svg-icon" style="fill:var(--ios-red)" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/></svg>';
  }
};

window.uploadWithChunks = async () => {
  const name = document.getElementById('rec-name').value || "MRAI Recording";
  const upTxt = document.getElementById('up-txt');
  const upBar = document.getElementById('up-bar');
  const reader = new FileReader();
  
  upTxt.style.display = 'block';
  reader.readAsDataURL(activeBlob);
  reader.onloadend = async () => {
    const base64 = reader.result;
    const LIMIT = 900 * 1024;
    const total = Math.ceil(base64.length / LIMIT);
    const bytes = activeBlob.size;
    let sizeStr = bytes >= 1000000 ? (bytes / 1000000).toFixed(1) + " MB" : (bytes / 1000).toFixed(1) + " KB";

    const docRef = await addDoc(collection(db, "audios"), { name, at: new Date(), size: sizeStr });
    for(let i=0; i<total; i++) {
      await addDoc(collection(db, `audios/${docRef.id}/chunks`), { idx: i, data: base64.substring(i*LIMIT, (i+1)*LIMIT) });
      upBar.style.width = Math.round(((i+1)/total)*100) + "%";
      document.getElementById('up-p').innerText = Math.round(((i+1)/total)*100);
    }
    location.reload();
  };
};

window.onFileSelect = (el) => { 
  if (el.files[0]) { 
      activeBlob = el.files[0]; 
      document.getElementById('rec-name').value = el.files[0].name.split('.')[0];
      document.getElementById('save-cloud').style.display = 'block'; 
  } 
};

function startTimer() { 
  let s=0; 
  const tEl = document.getElementById('timer');
  tEl.innerText = "00:00";
  timerInterval=setInterval(()=>{ 
      s++; let m=Math.floor(s/60); 
      tEl.innerText=`${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; 
  },1000); 
}
