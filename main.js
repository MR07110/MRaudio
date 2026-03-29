
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, startAfter, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// --- 0. NAVIGATSIYA ---
window.switchPage = (btn, pageId) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  btn.classList.add('active');
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
      <button class="btn-svg" id="dl-btn-${id}"><svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button>
    </div>
  `;

  div.querySelector(`#play-btn-${id}`).onclick = (e) => window.playAudio(id, e.currentTarget);
  div.querySelector(`#pbox-${id}`).onmousedown = (e) => window.playAudio.seek(e, id);
  div.querySelector(`#pbox-${id}`).ontouchstart = (e) => window.playAudio.seek(e, id);
  div.querySelector(`#loop-btn-${id}`).onclick = (e) => window.playAudio.toggleLoop(id, e.currentTarget);
  div.querySelector(`#prev-btn-${id}`).onclick = () => window.playAudio.skip(id, -10);
  div.querySelector(`#next-btn-${id}`).onclick = () => window.playAudio.skip(id, 10);
  div.querySelector(`#dl-btn-${id}`).onclick = () => window.playAudio.download(id, data.name);

  return div;
}

// --- 2. PLEYER NAZORATI ---
window.playAudio = async (id, btn) => {
  const icon = document.getElementById(`ic-${id}`);
  const bars = document.querySelectorAll(`#wf-${id} .w-bar`);
  const fill = document.getElementById(`pf-${id}`);

  // 1. Agar xuddi shu audio bosilsa (Pause/Play)
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

  // 2. Oldingi audioni to'xtatish va vizualni DEFAULT holatga keltirish
  if (currentAudio) { 
    currentAudio.pause(); 
    currentAudio.src = ""; 
    currentAudio.load(); 
  }

  if (currentPlayingId) {
    // Oldingi pleyer ikonkasi
    const oldIcon = document.getElementById(`ic-${currentPlayingId}`);
    if (oldIcon) {
      oldIcon.style.display = "block";
      oldIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
    // Oldingi spinnerni o'chirish
    const oldSpin = document.getElementById(`spin-${currentPlayingId}`);
    if (oldSpin) oldSpin.remove();
    // Oldingi progress va vizualizatsiyani DEFAULT qilish
    const oldFill = document.getElementById(`pf-${currentPlayingId}`);
    if (oldFill) oldFill.style.width = "0%";
    document.querySelectorAll(`#wf-${currentPlayingId} .w-bar`).forEach(b => { 
      b.classList.remove('active'); 
      b.style.height = "5px"; 
    });
  }

  // 3. Yangi audioni yuklashni boshlash
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
  function draw() {
    if (!audio.paused && currentPlayingId === id) {
      requestAnimationFrame(draw);
      analyzer.getByteFrequencyData(dataArray);
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

// --- 3. SEEKING & EXTRA ---
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
window.playAudio.download = async (id, name) => {
  const snap = await getDocs(query(collection(db, `audios/${id}/chunks`), orderBy("idx")));
  let b64 = ""; snap.forEach(c => b64 += c.data().data);
  const a = document.createElement("a"); a.href = b64; a.download = name + ".mp3"; a.click();
};

// --- 4. STUDIO & RECORDING ---
let studioAnz, studioData, studioStream;
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
          activeBlob = new Blob(chunks, { type: 'audio/mp3' }); 
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
