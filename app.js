(() => {
  // ====== CONFIG ======
  const fStart = 20, fEnd = 20000, duration = 300;

  const BANDS = [
    { n:"Subgrave",    min:20,   max:40,      c:"#8bd3ff", t:"Sensação física e “peso”. Mais sentido no corpo do que no ouvido." },
    { n:"Grave-Baixo", min:40,   max:80,      c:"#66e0ff", t:"Fundação do grave. Base rítmica e sustentação do low-end." },
    { n:"Grave-Alto",  min:80,   max:200,     c:"#4ff2d6", t:"Punch e impacto. Excesso aqui costuma embolar/mascarar." },
    { n:"Médio-Grave", min:200,  max:500,     c:"#72ff7a", t:"Corpo e ressonância (“boxy”). Pode soar abafado se exagerar." },
    { n:"Médio-Médio", min:500,  max:1500,    c:"#cfff6a", t:"Centro do timbre. Dá “leitura”, mas pode ficar nasal/duro." },
    { n:"Médio-Agudo", min:1500, max:5000,    c:"#ffe66a", t:"Presença e inteligibilidade. Região sensível do ouvido: cuidado." },
    { n:"Agudo",       min:5000, max:12000,   c:"#ffb86a", t:"Brilho e ataque. Pode evidenciar sibilância/aspereza." },
    { n:"Super-Agudo", min:12000,max:20000.1, c:"#ff4d4d", t:"“Ar” e cintilância. Fácil causar fadiga em volumes altos." }
  ];

  // ====== UI ======
  const freqEl = document.getElementById("freq");
  const bandEl = document.getElementById("bandLabel");
  const tipEl  = document.getElementById("bandTip");

  const startBtn = document.getElementById("startBtn");
  const stopBtn  = document.getElementById("stopBtn");

  const vol = document.getElementById("vol");
  const volLabel = document.getElementById("volLabel");

  const seek = document.getElementById("seek");
  const seekLabel = document.getElementById("seekLabel");
  const progInfo = document.getElementById("progInfo");

  const srInfo   = document.getElementById("srInfo");
  const gainInfo = document.getElementById("gainInfo");

  const modeName   = document.getElementById("modeName");
  const signalInfo = document.getElementById("signalInfo");
  const curveInfo  = document.getElementById("curveInfo");

  const modeSweepBtn = document.getElementById("modeSweep");
  const modeWhiteBtn = document.getElementById("modeWhite");
  const modePinkBtn  = document.getElementById("modePink");
  const modeToneBtn  = document.getElementById("modeTone");
  const toneBox      = document.getElementById("toneBox");
  const toneInput    = document.getElementById("toneInput");

  modeWhiteBtn.classList.add("whiteSolid");
  modePinkBtn.classList.add("pinkSolid");

  // ====== AUDIO ======
  let ctx = null, gain = null, osc = null, noiseSrc = null;
  let raf = null, tStart = 0, tEnd = 0;

  let whiteBuf = null, pinkBuf = null;

  // ====== STATE ======
  let offsetSec = 0;
  let isRunning = false;
  let lastBand = -1;
  let mode = "sweep"; // sweep | white | pink

  // ====== UTILS ======
  function pad2(n){ return String(n).padStart(2,"0"); }
  function fmtTime(sec){
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec/60), s = sec%60;
    return `${pad2(m)}:${pad2(s)}`;
  }
  function fmtHz(f){ return Math.round(f).toLocaleString("pt-BR") + " Hz"; }
  function gainToDbfs(g){
    const x = Math.max(0.000001, g);
    return 20 * Math.log10(x);
  }
  function freqAt(t){
    const p = Math.min(Math.max(t / duration, 0), 1);
    return fStart * Math.pow(fEnd/fStart, p);
  }
  function bandIndexFor(f){
    for (let i=0;i<BANDS.length;i++){
      const b=BANDS[i];
      if (f>=b.min && f<b.max) return i;
    }
    return BANDS.length-1;
  }
  function applyBand(i){
    const b = BANDS[i];
    const maxShown = (b.max>20000) ? "20.000" : String(Math.round(b.max));
    bandEl.textContent = `${b.n.toUpperCase()} (${b.min}–${maxShown} Hz)`;
    tipEl.textContent = b.t;
    document.documentElement.style.setProperty("--accent", b.c);
  }
  function updateSeekUI(t){
    const p = Math.min(Math.max(t / duration, 0), 1);
    seekLabel.textContent = `${fmtTime(t)} / ${fmtTime(duration)}`;
    progInfo.textContent = `${Math.round(p*100)}%`;
  }
  function previewSweepAt(t){
    const f = freqAt(t);
    freqEl.textContent = fmtHz(f);

    const bi = bandIndexFor(f);
    if (bi !== lastBand){
      applyBand(bi);
      lastBand = bi;
    }
    updateSeekUI(t);
  }
  function previewNoise(){
    const isWhite = (mode === "white");
    const accent = isWhite ? "#ffffff" : "#ff6ec7";

    document.documentElement.style.setProperty("--accent", accent);

    freqEl.textContent = "—";
    bandEl.textContent = isWhite ? "RUÍDO BRANCO" : "RUÍDO ROSA";
    tipEl.textContent = isWhite
      ? "Energia igual por Hz. Útil para demonstrar hiss, espectro e percepção de brilho."
      : "Energia por oitava (≈ -3 dB/oitava). Soa mais “equilibrado” ao ouvido; ótimo para referência.";

    // ruído não tem “posição”
    seekLabel.textContent = `00:00 / ${fmtTime(duration)}`;
    progInfo.textContent = "—";
  }
  function previewTone(){
  const f = Number(toneInput.value);
  freqEl.textContent = fmtHz(f);
  bandEl.textContent = "FREQUÊNCIA FIXA";
  tipEl.textContent = "Tom contínuo gerado manualmente.";
  // em tone não tem posição
  seekLabel.textContent = `00:00 / ${fmtTime(duration)}`;
  progInfo.textContent = "—";
}

function startTone(){
  stopSources();
  ensureGain();

  const f = Number(toneInput.value);
  if (!f || f < 15 || f > 25000) return;

  const g0 = Math.max(0.00001, Number(vol.value));
  const nowG = ctx.currentTime;

  gain.gain.cancelScheduledValues(nowG);
  gain.gain.setValueAtTime(g0, nowG);

  osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(f, ctx.currentTime);
  osc.connect(gain);

  srInfo.textContent = `${Math.round(ctx.sampleRate)} Hz`;
  gainInfo.textContent = `${g0.toFixed(3)} (≈ ${gainToDbfs(g0).toFixed(1)} dBFS)`;

  previewTone();
  osc.start();

  setRunning(true);
}
  function setRunning(r){
    isRunning = r;
    startBtn.disabled = r;
    stopBtn.disabled  = !r;
  }

  // ===== iOS/Safari resume (sem await) =====
  function ensureCtx(){
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }
  function resumeCtxThen(cb){
    ensureCtx();

    const doUnlock = () => {
      try{
        const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        src.stop(0.01);
      }catch(e){}
    };

    const go = () => { doUnlock(); cb(); };

    if (ctx.state === "suspended") ctx.resume().then(go).catch(go);
    else go();
  }
  function ensureGain(){
    if (!gain){
      gain = ctx.createGain();
      gain.connect(ctx.destination);
    }
  }
  function stopSources(){
    if (!ctx) return;
    const now = ctx.currentTime;

    if (gain){
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0.00001, now + 0.03);
    }

    try{ if (osc) osc.stop(now + 0.04); }catch(e){}
    try{ if (noiseSrc) noiseSrc.stop(now + 0.04); }catch(e){}

    osc = null;
    noiseSrc = null;

    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  // ===== Noise buffers =====
  function makeWhiteBuffer(seconds=2){
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<len;i++) data[i] = (Math.random()*2 - 1) * 0.6;
    return buf;
  }
  function makePinkBuffer(seconds=3){
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buf.getChannelData(0);

    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;

    for (let i=0; i<len; i++){
      const white = Math.random()*2 - 1;

      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;

      out[i] = (pink * 0.11);
    }
    return buf;
  }
  function ensureNoiseBuffers(){
    if (!whiteBuf) whiteBuf = makeWhiteBuffer(2);
    if (!pinkBuf)  pinkBuf  = makePinkBuffer(3);
  }

  // ===== Start/loops =====
  function startSweepFromOffset(newOffset){
    stopSources();
    ensureGain();

const g0 = Math.max(0.00001, Number(vol.value));
const nowG = ctx.currentTime;

// MUITO IMPORTANTE: limpa automações antigas (fade-out etc.)
gain.gain.cancelScheduledValues(nowG);
gain.gain.setValueAtTime(g0, nowG);

    offsetSec = Math.min(Math.max(newOffset, 0), duration);
    seek.value = String(offsetSec);

    if (offsetSec >= duration){
      previewSweepAt(duration);
      setRunning(false);
      return;
    }

    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.connect(gain);

    const now = ctx.currentTime;
    tStart = now + 0.05;
    const remaining = duration - offsetSec;
    tEnd = tStart + remaining;

    const f0 = freqAt(offsetSec);
    osc.frequency.setValueAtTime(f0, tStart);
    osc.frequency.exponentialRampToValueAtTime(fEnd, tEnd);

    srInfo.textContent = `${Math.round(ctx.sampleRate)} Hz`;
    gainInfo.textContent = `${g0.toFixed(3)} (≈ ${gainToDbfs(g0).toFixed(1)} dBFS)`;

    previewSweepAt(offsetSec);

    osc.start(tStart);
    osc.stop(tEnd);

    setRunning(true);
    raf = requestAnimationFrame(loopSweep);
  }

  function startNoise(){
    stopSources();
    ensureGain();
    ensureNoiseBuffers();

const g0 = Math.max(0.00001, Number(vol.value));
const nowG = ctx.currentTime;

// limpa automações antigas
gain.gain.cancelScheduledValues(nowG);
gain.gain.setValueAtTime(g0, nowG);

    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = (mode === "white") ? whiteBuf : pinkBuf;
    noiseSrc.loop = true;
    noiseSrc.connect(gain);

    srInfo.textContent = `${Math.round(ctx.sampleRate)} Hz`;
    gainInfo.textContent = `${g0.toFixed(3)} (≈ ${gainToDbfs(g0).toFixed(1)} dBFS)`;

    previewNoise();
    noiseSrc.start();

    setRunning(true);
    raf = requestAnimationFrame(loopNoiseUI);
  }

  function loopNoiseUI(){
    if (!ctx || !gain || !isRunning) return;
    const g = gain.gain.value;
    gainInfo.textContent = `${g.toFixed(3)} (≈ ${gainToDbfs(g).toFixed(1)} dBFS)`;
    raf = requestAnimationFrame(loopNoiseUI);
  }

  function loopSweep(){
    if (!ctx || !osc) return;

    const now = ctx.currentTime;
    const t = offsetSec + (now - tStart);

    previewSweepAt(Math.min(Math.max(t,0), duration));

    const g = gain ? gain.gain.value : Number(vol.value);
    gainInfo.textContent = `${g.toFixed(3)} (≈ ${gainToDbfs(g).toFixed(1)} dBFS)`;

    if (now < tEnd) raf = requestAnimationFrame(loopSweep);
    else{
      offsetSec = duration;
      setRunning(false);
      stopSources();
      previewSweepAt(duration);
    }
  }

// ===== Mode switch =====
function setMode(newMode){
  // 1) normaliza o modo SEM efeitos colaterais
  const nextMode = String(newMode).toLowerCase().trim();
  mode = nextMode;
  modeToneBtn.classList.toggle("active", mode === "tone");

  // 2) UI dos botões
  modeSweepBtn.classList.toggle("active", mode === "sweep");
  modeWhiteBtn.classList.toggle("active", mode === "white");
  modePinkBtn.classList.toggle("active",  mode === "pink");

  // 3) seek: só funciona no sweep (sempre roda!)
  const isSweep = (mode === "sweep");
  seek.disabled = !isSweep;
  seek.classList.toggle("disabled", !isSweep);
  const isTone = (mode === "tone");
  toneBox.style.display = isTone ? "flex" : "none";


  // 4) Atualiza textos/tela conforme modo
  if (isSweep){
    modeName.textContent = "SWEEP";
    signalInfo.textContent = "SWEEP";
    curveInfo.textContent = "LOG";
    modeName.style.color = "";

    // volta a preview do sweep no ponto atual do slider
    previewSweepAt(Number(seek.value));
  }
  else if (mode === "white"){
    modeName.textContent = "RUÍDO BRANCO (White Noise)";
    signalInfo.textContent = "RUÍDO BRANCO (White Noise)";
    curveInfo.textContent = "—";
    modeName.style.color = "#ffffff";

    previewNoise();
  }
  else if (mode === "tone"){
  modeName.textContent = "TOM FIXO";
  signalInfo.textContent = "TONE";
  curveInfo.textContent = "—";
  modeName.style.color = "";
  previewTone();
  }
  else { // pink
    modeName.textContent = "RUÍDO ROSA (Pink Noise)";
    signalInfo.textContent = "RUÍDO ROSA (Pink Noise)";
    curveInfo.textContent = "—";
    modeName.style.color = "#ff6ec7";

    previewNoise();
  }

  // 5) Troca automática do áudio ao mudar de modo (se estiver tocando)
  if (isRunning) {
    resumeCtxThen(() => {
      if (mode === "sweep") {
        startSweepFromOffset(Number(seek.value));
      } else {
        startNoise(); // usa mode (white/pink)
      }
    });
  }
}

  function startAction(){
    resumeCtxThen(() => {
      ensureCtx();
      ensureGain();
      ensureNoiseBuffers();

     if (mode === "sweep") startSweepFromOffset(Number(seek.value));
     else if (mode === "white" || mode === "pink") startNoise();
     else if (mode === "tone") startTone();
    });
  }

  // ===== Events =====
  vol.addEventListener("input", () => {
    const v = Number(vol.value);
    volLabel.textContent = Math.round(v*100) + "%";
    gainInfo.textContent = `${v.toFixed(3)} (≈ ${gainToDbfs(v).toFixed(1)} dBFS)`;
    if (gain && ctx){
      const now = ctx.currentTime;
      gain.gain.setTargetAtTime(Math.max(0.00001, v), now, 0.02);
    }
  });

seek.addEventListener("input", () => {
  if (seek.disabled) return;      // trava nos ruídos
  offsetSec = Number(seek.value);
  if (!isRunning) previewSweepAt(offsetSec);
  else updateSeekUI(offsetSec);
});

seek.addEventListener("change", () => {
  if (seek.disabled) return;      // trava nos ruídos
  offsetSec = Number(seek.value);
  if (isRunning) startAction();   // retoma do ponto
  else previewSweepAt(offsetSec);
});

  // Start (pointerdown ajuda no iOS/Safari)
  startBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startAction();
  }, { passive:false });

  startBtn.addEventListener("click", (e) => {
    e.preventDefault();
    startAction();
  });

  stopBtn.addEventListener("click", () => {
    stopSources();
    setRunning(false);
    srInfo.textContent = "—";

    if (mode === "sweep"){
      offsetSec = Number(seek.value);
      previewSweepAt(offsetSec);
    } else {
      previewNoise();
    }
  });

  modeSweepBtn.addEventListener("click", () => setMode("sweep"));
  modeWhiteBtn.addEventListener("click", () => setMode("white"));
  modePinkBtn.addEventListener("click", () => setMode("pink"));
  modeToneBtn.addEventListener("click", () => setMode("tone"));

  // ===== Init =====
  seek.max = String(duration);
  seek.value = "0";

  const gInit = Number(vol.value);
  volLabel.textContent = Math.round(gInit*100) + "%";
  gainInfo.textContent = `${gInit.toFixed(3)} (≈ ${gainToDbfs(gInit).toFixed(1)} dBFS)`;

  setMode("sweep");
  previewSweepAt(0);
  setRunning(false);
// ===== Splash =====
const splash = document.getElementById("splash");
const hideSplash = () => {
  if (!splash) return;
  splash.classList.add("hide");
  // depois do fade, remove do layout
  setTimeout(() => splash.classList.add("gone"), 300);
};

// some sozinho após carregar
window.addEventListener("load", () => setTimeout(hideSplash, 450));

// some ao primeiro toque/clique
["pointerdown","touchstart","mousedown","keydown"].forEach(evt => {
  window.addEventListener(evt, hideSplash, { once:true, passive:true });
});
})();

// ===== Theme system =====
(() => {
  const themeBtn = document.getElementById("themeBtn");
  const themeMenu = document.getElementById("themeMenu");
  const items = Array.from(document.querySelectorAll(".themeItem"));
  const KEY = "freq2020_theme";

  if (!themeBtn || !themeMenu || items.length === 0) return;

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(KEY, theme);

    items.forEach(btn => {
      const is = btn.dataset.theme === theme;
      btn.setAttribute("aria-checked", is ? "true" : "false");
    });
  }

  function openMenu(open) {
    themeMenu.classList.toggle("open", open);
    themeBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  const saved = localStorage.getItem(KEY);
  setTheme(saved || "deep");

  themeBtn.addEventListener("click", () => {
    openMenu(!themeMenu.classList.contains("open"));
  });

  items.forEach(btn => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.theme);
      openMenu(false);
    });
  });

  document.addEventListener("click", (e) => {
    if (!themeMenu.classList.contains("open")) return;
    if (themeMenu.contains(e.target) || themeBtn.contains(e.target)) return;
    openMenu(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") openMenu(false);
  });
})();


  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }