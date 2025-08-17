// Weave Headband AR v4.3 — All-in-one implementation

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const exportCanvas = document.getElementById('exportCanvas');
const ex = exportCanvas.getContext('2d');

// UI
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const styleSelect = document.getElementById('styleSelect');
const colorPalette = document.getElementById('colorPalette');
const beautyToggle = document.getElementById('beautyToggle');

const bandTextInput = document.getElementById('bandText');
const fontSelect = document.getElementById('fontSelect');
const fontSize = document.getElementById('fontSize');
const fontSizeVal = document.getElementById('fontSizeVal');
const fontWeight = document.getElementById('fontWeight');
const fontWeightVal = document.getElementById('fontWeightVal');
const textColor = document.getElementById('textColor');
const textStrokeToggle = document.getElementById('textStrokeToggle');

const captureBtn = document.getElementById('captureBtn');
const shareBtn = document.getElementById('shareBtn');
const downloadBtn = document.getElementById('downloadBtn');

// State
let currentColor = '#FF7A00'; // default Orange
let landmarks = null;
let mouthOpen = false;
let bubbles = [];
let smoothNose = {x:0,y:0,ready:false};
let beautyOn = true;

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

// Tabs
tabs.forEach(t => {
  t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('panel-' + t.dataset.tab).classList.add('active');
  });
});

// Color palette
colorPalette.querySelectorAll('.swatch').forEach(s => {
  s.style.background = s.dataset.color;
  s.addEventListener('click', () => {
    colorPalette.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
    s.classList.add('active');
    currentColor = s.dataset.color;
  });
});

beautyToggle.addEventListener('change', () => {
  beautyOn = beautyToggle.checked;
});

// Text controls
function updateFontLabels(){
  fontSizeVal.textContent = fontSize.value;
  fontWeightVal.textContent = fontWeight.value;
}
fontSize.addEventListener('input', updateFontLabels);
fontWeight.addEventListener('input', updateFontLabels);
updateFontLabels();

// Auto open camera (rear if available for better AR)
async function initCamera(){
  try{
    const constraints = {
      audio:false,
      video:{
        facingMode: { ideal: 'user' }, // selfie camera
        width: { ideal: 1280 },
        height:{ ideal: 720 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    resizeCanvas();
  }catch(err){
    console.error('Camera init failed:', err);
    alert('無法開啟相機，請檢查權限設定。');
  }
}
function resizeCanvas(){
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// FaceMesh
let faceMesh;
async function initFaceMesh(){
  faceMesh = new FaceMesh.FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  faceMesh.onResults(onResults);

  // Use CameraUtils to feed frames
  const cam = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({image: video});
    },
    width: 1280,
    height: 720
  });
  cam.start();
}

function lerp(a,b,t){ return a + (b-a)*t; }

function onResults(results){
  octx.clearRect(0,0,overlay.width, overlay.height);

  // Optional "beauty" softening overlay in preview
  if (beautyOn){
    octx.save();
    octx.globalAlpha = 0.12;
    octx.filter = 'blur(2px) saturate(1.06) contrast(1.03)';
    octx.drawImage(video, 0, 0, overlay.width, overlay.height);
    octx.restore();
  }

  const lm = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
  if (!lm){
    drawBubbles(); // still animate bubbles
    return;
  }
  landmarks = lm;

  // Compute some anchor points
  const toXY = (pt)=>({ x: pt.x * overlay.width, y: pt.y * overlay.height });
  const leftForehead = toXY(lm[71]);  // approximate upper forehead
  const rightForehead = toXY(lm[301]);
  const midForehead = { x:(leftForehead.x+rightForehead.x)/2, y:(leftForehead.y+rightForehead.y)/2 };

  // Nose tip for nose filter
  const noseTip = toXY(lm[1]);
  if (!smoothNose.ready){
    smoothNose.x = noseTip.x; smoothNose.y = noseTip.y; smoothNose.ready = true;
  }else{
    smoothNose.x = lerp(smoothNose.x, noseTip.x, 0.35);
    smoothNose.y = lerp(smoothNose.y, noseTip.y, 0.35);
  }

  // Headband geometry (follow forehead line)
  const dx = rightForehead.x - leftForehead.x;
  const dy = rightForehead.y - leftForehead.y;
  const angle = Math.atan2(dy, dx);
  const width = Math.hypot(dx, dy) * 1.2; // a bit wider than forehead
  const center = midForehead;
  const height = clamp(width * 0.18, 14, 80); // headband thickness

  drawHeadband(center, angle, width, height);
  drawBandText(center, angle, width, height);

  // Mouth open detector -> spawn rabbit bubbles
  const upperLip = toXY(lm[13]);
  const lowerLip = toXY(lm[14]);
  const mouthGap = Math.hypot(upperLip.x-lowerLip.x, upperLip.y-lowerLip.y);
  const faceSize = Math.hypot(dx,dy);
  const open = mouthGap > faceSize * 0.09;
  if (open && !mouthOpen){
    spawnBubbles(6); // burst
  }
  mouthOpen = open;

  drawRabbitNose(smoothNose);

  drawBubbles();
}

// Draw rounded rotated rect
function rr(ctx, w, h, r){
  const x = -w/2, y = -h/2;
  const rad = Math.min(r, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rad,y);
  ctx.arcTo(x+w,y,x+w,y+h,rad);
  ctx.arcTo(x+w,y+h,x,y+h,rad);
  ctx.arcTo(x,y+h,x,y,rad);
  ctx.arcTo(x,y,x+w,y,rad);
  ctx.closePath();
}

function stylizePattern(ctx, style, w, h, color){
  ctx.fillStyle = color;
  // Base strip
  rr(ctx, w, h, h*0.45);
  ctx.fill();

  // Overlay patterns by style
  ctx.save();
  ctx.clip();
  switch(style){
    case 'moonRabbit': {
      // central moon disc & tiny rabbit ears pattern
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#FFF4D6';
      for(let i= -Math.ceil(w/40); i<Math.ceil(w/40); i++){
        ctx.beginPath();
        ctx.arc(i*40, 0, h*0.35, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFFFFF';
      for(let i= -Math.ceil(w/80); i<Math.ceil(w/80); i++){
        ctx.beginPath(); // little ear
        ctx.roundRect(i*80-6, -h*0.2, 12, h*0.4, 6);
        ctx.fill();
      }
      break;
    }
    case 'cleanFit': {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-w/2, -h/2 + h*0.12, w, h*0.12);
      ctx.fillRect(-w/2, h/2 - h*0.24, w, h*0.12);
      break;
    }
    case 'twill': {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#ffffff';
      for(let x=-w/2; x<w/2; x+=8){
        ctx.fillRect(x, -h/2, 3, h);
      }
      ctx.globalAlpha = 0.16;
      ctx.rotate(Math.PI/12);
      for(let y=-h; y<h; y+=6){
        ctx.fillRect(-w, y, w*2, 2);
      }
      break;
    }
    case 'racing': {
      ctx.fillStyle = '#ffffff';
      const stripe = h*0.28;
      ctx.fillRect(-w/2, -stripe/2, w, stripe);
      ctx.fillStyle = '#00000022';
      for(let x=-w/2; x<w/2; x+=20){
        ctx.fillRect(x, -h/2, 10, h);
      }
      break;
    }
    case 'sports': {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-w/2, -h*0.35);
      ctx.quadraticCurveTo(0, -h*0.55, w/2, -h*0.35);
      ctx.lineTo(w/2, -h*0.1);
      ctx.quadraticCurveTo(0, -h*0.3, -w/2, -h*0.1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'mountain': {
      ctx.fillStyle = '#ffffff2a';
      for(let i=-3;i<=3;i++){
        ctx.beginPath();
        ctx.moveTo(-w/2 + i*40, h/2);
        ctx.lineTo(-w/2 + i*40 + 20, -h/2);
        ctx.lineTo(-w/2 + i*40 + 40, h/2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'ballet': {
      ctx.fillStyle = '#ffffff29';
      for(let i=-Math.ceil(w/30); i<Math.ceil(w/30); i++){
        ctx.beginPath();
        ctx.ellipse(i*30, 0, 8, h*0.45, 0, 0, Math.PI*2);
        ctx.fill();
      }
      break;
    }
    case 'y2k': {
      ctx.fillStyle = '#ffffff';
      for(let i=-Math.ceil(w/60); i<Math.ceil(w/60); i++){
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(i*60, 0, h*0.22, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 0.22;
        ctx.beginPath();
        ctx.arc(i*60, 0, h*0.36, 0, Math.PI*2);
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();

  // Soft border
  ctx.lineWidth = Math.max(1, h*0.08);
  ctx.strokeStyle = '#00000055';
  rr(ctx, w, h, h*0.45);
  ctx.stroke();
}

function drawHeadband(center, angle, width, height){
  octx.save();
  octx.translate(center.x, center.y - height*0.2); // slightly above mid-forehead
  octx.rotate(angle);
  stylizePattern(octx, styleSelect.value, width, height, currentColor);
  octx.restore();
}

function drawBandText(center, angle, width, height){
  const text = bandTextInput.value.trim();
  if (!text) return;
  const weight = fontWeight.value;
  const size = fontSize.value;
  const family = fontSelect.value.split(' ',1)[0]; // but we actually set full font string below

  octx.save();
  octx.translate(center.x, center.y - height*0.2);
  octx.rotate(angle);

  // Ensure text not mirrored in preview (video is mirrored by CSS, canvas is normal)
  const fontStr = `${weight} ${size}px ${fontSelect.value.split(' ').slice(1).join(' ')}`;
  octx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';
  octx.fillStyle = textColor.value;
  if (textStrokeToggle.checked){
    octx.lineWidth = Math.max(2, height*0.09);
    octx.strokeStyle = '#000000AA';
    octx.strokeText(text, 0, 0);
  }
  octx.fillText(text, 0, 0);
  octx.restore();
}

// Rabbit nose + whiskers
function drawRabbitNose(pos){
  octx.save();
  octx.translate(pos.x, pos.y+6);
  // nose
  octx.fillStyle = '#ffb6c1';
  octx.beginPath();
  octx.ellipse(0, 0, 14, 10, 0, 0, Math.PI*2);
  octx.fill();
  // philtrum
  octx.strokeStyle = '#00000066';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.moveTo(0, 6);
  octx.lineTo(0, 16);
  octx.stroke();
  // whiskers
  octx.beginPath();
  octx.moveTo(-28, 6); octx.lineTo(-6, 6);
  octx.moveTo(28, 6); octx.lineTo(6, 6);
  octx.moveTo(-28, 12); octx.lineTo(-6, 10);
  octx.moveTo(28, 12); octx.lineTo(6, 10);
  octx.stroke();
  octx.restore();
}

// Bubble system
function spawnBubbles(n=5){
  const W = overlay.width, H = overlay.height;
  for(let i=0;i<n;i++){
    bubbles.push({
      x: Math.random()*W,
      y: H + Math.random()*40,
      r: 14 + Math.random()*18,
      vy: 1.2 + Math.random()*1.4,
      vx: (Math.random()-0.5)*0.8,
      life: 0,
      maxLife: 240 + Math.random()*120
    });
  }
}
function drawBubbles(){
  const W = overlay.width, H = overlay.height;
  for(let i=bubbles.length-1;i>=0;i--){
    const b = bubbles[i];
    b.y -= b.vy;
    b.x += b.vx * Math.sin(b.life/30);
    b.life++;

    // draw bubble with rabbit face
    octx.save();
    octx.globalAlpha = 0.8;
    octx.fillStyle = '#ffffff';
    octx.strokeStyle = '#ffffffaa';
    octx.lineWidth = 2;
    octx.beginPath();
    octx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    octx.fill();
    octx.stroke();

    // ears
    octx.beginPath();
    octx.ellipse(b.x - b.r*0.45, b.y - b.r*1.1, b.r*0.28, b.r*0.6, -0.2, 0, Math.PI*2);
    octx.ellipse(b.x + b.r*0.45, b.y - b.r*1.1, b.r*0.28, b.r*0.6, 0.2, 0, Math.PI*2);
    octx.fill();

    // eyes
    octx.fillStyle = '#333';
    octx.beginPath();
    octx.arc(b.x - b.r*0.28, b.y - b.r*0.15, b.r*0.08, 0, Math.PI*2);
    octx.arc(b.x + b.r*0.28, b.y - b.r*0.15, b.r*0.08, 0, Math.PI*2);
    octx.fill();
    // nose
    octx.fillStyle = '#ff7aa2';
    octx.beginPath();
    octx.arc(b.x, b.y + b.r*0.05, b.r*0.08, 0, Math.PI*2);
    octx.fill();

    octx.restore();

    if (b.y < -60 || b.life > b.maxLife) bubbles.splice(i,1);
  }
}

// Capture function — produce 1080x1920 portrait PNG
async function capturePortrait(){
  // Draw current frame + overlays to exportCanvas
  const W = exportCanvas.width, H = exportCanvas.height;

  // Compute source rect from the video (cover)
  const v = video.videoWidth / video.videoHeight;
  const c = W / H;
  let sx, sy, sw, sh;
  if (v > c){
    // video is wider => cut sides
    sh = video.videoHeight;
    sw = sh * c;
    sx = (video.videoWidth - sw)/2;
    sy = 0;
  }else{
    // taller => cut top/bottom
    sw = video.videoWidth;
    sh = sw / c;
    sx = 0;
    sy = (video.videoHeight - sh)/2;
  }

  // Background frame (unmirrored for output)
  ex.clearRect(0,0,W,H);
  ex.filter = beautyOn ? 'blur(2px) saturate(1.06) contrast(1.03)' : 'none';
  ex.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  ex.filter = 'none';

  // Re-draw AR elements for export using last landmarks
  if (landmarks){
    // map helper
    const mapPt = (pt)=>({ x: (pt.x * W), y: (pt.y * H) });
    const leftForehead = mapPt(landmarks[71]);
    const rightForehead = mapPt(landmarks[301]);
    const midForehead = { x:(leftForehead.x+rightForehead.x)/2, y:(leftForehead.y+rightForehead.y)/2 };
    const dx = rightForehead.x - leftForehead.x;
    const dy = rightForehead.y - leftForehead.y;
    const angle = Math.atan2(dy, dx);
    const width = Math.hypot(dx, dy) * 1.2;
    const height = clamp(width * 0.18, 28, 160);

    // headband
    ex.save();
    ex.translate(midForehead.x, midForehead.y - height*0.2);
    ex.rotate(angle);
    stylizePattern(ex, styleSelect.value, width, height, currentColor);
    ex.restore();

    // text
    ex.save();
    ex.translate(midForehead.x, midForehead.y - height*0.2);
    ex.rotate(angle);
    ex.font = `${fontWeight.value} ${fontSize.value}px Inter, system-ui, sans-serif`;
    ex.textAlign = 'center';
    ex.textBaseline = 'middle';
    ex.fillStyle = textColor.value;
    if (textStrokeToggle.checked){
      ex.lineWidth = Math.max(2, height*0.09);
      ex.strokeStyle = '#000000AA';
      ex.strokeText(bandTextInput.value, 0, 0);
    }
    ex.fillText(bandTextInput.value, 0, 0);
    ex.restore();

    // rabbit nose
    const nose = mapPt(landmarks[1]);
    ex.save();
    ex.translate(nose.x, nose.y+6);
    ex.fillStyle = '#ffb6c1';
    ex.beginPath(); ex.ellipse(0,0,20,14,0,0,Math.PI*2); ex.fill();
    ex.strokeStyle = '#00000066'; ex.lineWidth = 3;
    ex.beginPath(); ex.moveTo(0,10); ex.lineTo(0,26); ex.stroke();
    ex.beginPath();
    ex.moveTo(-40,12); ex.lineTo(-8,12);
    ex.moveTo(40,12); ex.lineTo(8,12);
    ex.moveTo(-40,20); ex.lineTo(-8,18);
    ex.moveTo(40,20); ex.lineTo(8,18);
    ex.stroke();
    ex.restore();
  }

  // Note: bubbles are not re-drawn into export (they are ephemeral FX). If desired, we could add.
  // For now we include them lightly:
  ex.save();
  ex.globalAlpha = 0.7;
  bubbles.forEach(b=>{
    ex.fillStyle = '#ffffff';
    ex.strokeStyle = '#ffffffaa';
    ex.lineWidth = 2;
    ex.beginPath(); ex.arc(b.x/W*exportCanvas.width, b.y/H*exportCanvas.height, b.r*(exportCanvas.width/overlay.width), 0, Math.PI*2);
    ex.fill(); ex.stroke();
  });
  ex.restore();

  const blob = await new Promise(res => exportCanvas.toBlob(res, 'image/png', 1.0));
  const file = new File([blob], `weave_headband_${Date.now()}.png`, {type:'image/png'});
  return file;
}

// Share & Download
async function doCapture(){
  const file = await capturePortrait();
  // Keep last capture in memory for share
  window._lastCapture = file;

  // Trigger download by default
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(a.href);
  a.remove();
}

async function doShare(){
  try{
    const file = window._lastCapture || await capturePortrait();
    if (navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({
        files: [file],
        title: 'Weave Headband AR',
        text: 'Weave Headband AR v4.3 分享'
      });
    }else{
      // Fallback: download
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(a.href); a.remove();
      alert('此裝置不支援 Web Share，已改為下載。');
    }
  }catch(err){
    console.error(err);
    alert('分享失敗，請重試或改為下載。');
  }
}

async function doDownload(){
  const file = await capturePortrait();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(a.href); a.remove();
}

// Hook buttons
captureBtn.addEventListener('click', doCapture);
shareBtn.addEventListener('click', doShare);
downloadBtn.addEventListener('click', doDownload);

// Init everything
(async function boot(){
  // Tabs default 'style'
  document.querySelector('[data-tab="style"]').click();

  await initCamera();
  await initFaceMesh();
})();