/* 1:1 블러 카드 메이커 — app.js
   사진 → 1080×1080 블러 배경 + 썸네일/코멘트 문구 + 아웃트로 카드.
   모든 처리는 브라우저 안에서만 하고 어디로도 보내지 않는다. */
(() => {
  'use strict';

  const W = 1080, H = 1080;
  const F_BLACK = '"Black Han Sans", "Noto Sans KR", sans-serif';
  const F_NOTO = '"Noto Sans KR", -apple-system, "Malgun Gothic", sans-serif';

  const $ = (id) => document.getElementById(id);
  const canvas = $('stageCanvas');

  /* ───────── 상태 ───────── */
  const S = {
    tab: 'card',
    blur: 28,
    dark: 35,
    fit: 'contain',
    trimTop: 0,
    trimBottom: 0,
    textMode: 'thumb',
    title1: '',
    title2: '',
    sub: '',
    hlWords: '',
    comment: '',
    scale: 100,
    scrim: 52,
    scrimOpacity: 90,
    strokeOn: true,
    strokeWidth: 4,
    shadowOn: true,
    shadowBlur: 14,
    shadowY: 8,
    shadowOpacity: 55,
    accent: '#C084FC',
    outroRatio: '1:1',
    outro: {
      brand: 'SINGULBUNGUL ANIMAL VILLAGE',
      label: '오늘의 짤 / END',
      title1: '오늘의 짤,',
      title2: '이렇게 정리!',
      item1: '시골 전통시장 가격 표지판 모음',
      item2: '차매·퀴이·잠홍·아복하도까지 오타 대잔치',
      item3: '짤 속 과일 보관 용기는 프로필 링크 028번',
      cta1: '재밌게 보셨다면',
      cta2: '좋아요와 팔로우!',
      ch1: 'YouTube 싱글벙글 동물촌',
      ch2: 'TikTok @animallolvillage',
      foot: '프로필 링크에서 짤 속 아이템 모아보기'
    }
  };

  const items = [];      // {name, img, url}
  let active = -1;
  let fontsReady = false;

  /* ───────── 저장/복원 ───────── */
  const STORE_KEY = 'cm.v1';
  function save() {
    try {
      const copy = JSON.parse(JSON.stringify(S));
      delete copy.tab;
      localStorage.setItem(STORE_KEY, JSON.stringify(copy));
    } catch (e) { /* 사생활 모드 등 */ }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      for (const k of Object.keys(S)) {
        if (k === 'tab' || k === 'outro') continue;
        if (d[k] !== undefined) S[k] = d[k];
      }
      if (d.outro) Object.assign(S.outro, d.outro);
    } catch (e) { /* 무시 */ }
  }

  /* ───────── 유틸 ───────── */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 2400);
  }

  function note(msg) { $('stageNote').textContent = msg; }

  function download(blob, name) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  function stamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function safeName(name) {
    return (name || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|#%]/g, '_').slice(0, 40) || 'image';
  }

  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(v, 16);
    if (!Number.isFinite(n)) return `rgba(192,132,252,${a})`;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  /* 캔버스에서 웹폰트 굵기(weight)가 실제로 구분되는지 확인한다.
     구분되지 않으면 같은 색으로 살짝 덧그려 굵기를 흉내 낸다(합성 볼드). */
  let synthBold = false;
  function detectSyntheticBold() {
    try {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 120;
      const g = c.getContext('2d');
      const ink = (weight) => {
        g.clearRect(0, 0, 160, 120);
        g.fillStyle = '#fff'; g.fillRect(0, 0, 160, 120);
        g.fillStyle = '#000';
        g.font = `${weight} 84px "Noto Sans KR"`;
        g.fillText('짤', 8, 96);
        const d = g.getImageData(0, 0, 160, 120).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
        return n;
      };
      synthBold = ink(400) === ink(900);
    } catch (e) { synthBold = false; }
    return synthBold;
  }

  function boldFactor(weight) {
    if (!synthBold || weight < 600) return 0;
    if (weight >= 900) return 0.06;
    if (weight >= 800) return 0.045;
    return 0.03;
  }

  function roundRect(g, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + rr, y);
    g.arcTo(x + w, y, x + w, y + h, rr);
    g.arcTo(x + w, y + h, x, y + h, rr);
    g.arcTo(x, y + h, x, y, rr);
    g.arcTo(x, y, x + w, y, rr);
    g.closePath();
  }

  /* ───────── 이미지 로드 ───────── */
  async function loadImage(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
      catch (e) { /* fallback */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('이미지를 열 수 없어요'));
      im.src = url;
    });
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(f =>
      /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name));
    if (!files.length) { toast('이미지 파일이 아니에요'); return; }
    let firstNew = -1;
    for (const f of files) {
      try {
        const img = await loadImage(f);
        items.push({ name: f.name, img, url: URL.createObjectURL(f) });
        if (firstNew < 0) firstNew = items.length - 1;
      } catch (e) {
        toast(`${f.name} — 열 수 없음`);
      }
    }
    if (firstNew >= 0) active = firstNew;
    renderThumbs();
    render();
    note(`${items.length}장 · ${active >= 0 ? safeName(items[active].name) : ''}`);
  }

  function renderThumbs() {
    const box = $('thumbs');
    box.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb' + (i === active ? ' on' : '');
      b.title = it.name;
      const im = document.createElement('img');
      im.src = it.url; im.alt = it.name; im.decoding = 'async';
      const n = document.createElement('span');
      n.className = 'n'; n.textContent = String(i + 1);
      b.append(im, n);
      b.addEventListener('click', () => {
        active = i; renderThumbs(); render(); note(safeName(it.name));
      });
      box.appendChild(b);
    });
    $('countTxt').textContent = `${items.length}장`;
    $('stageEmpty').hidden = items.length > 0 || S.tab === 'outro';
    $('zipBtn').disabled = items.length === 0 || S.tab === 'outro';
    $('thumbs').style.display = S.tab === 'card' ? '' : 'none';
  }

  /* ───────── 텍스트 조각(포인트 색) ───────── */
  function segments(line, words) {
    const list = (words || '').split(',').map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const part of line.split(/(\[[^\]]+\])/g)) {
      if (!part) continue;
      if (part.length > 2 && part.startsWith('[') && part.endsWith(']')) {
        out.push({ t: part.slice(1, -1), a: true });
        continue;
      }
      if (!list.length) { out.push({ t: part, a: false }); continue; }
      let rest = part;
      while (rest.length) {
        let idx = -1, hit = '';
        for (const w of list) {
          const i = rest.toLowerCase().indexOf(w.toLowerCase());
          if (i >= 0 && (idx < 0 || i < idx)) { idx = i; hit = w; }
        }
        if (idx < 0) { out.push({ t: rest, a: false }); break; }
        if (idx > 0) out.push({ t: rest.slice(0, idx), a: false });
        out.push({ t: rest.slice(idx, idx + hit.length), a: true });
        rest = rest.slice(idx + hit.length);
      }
    }
    return out.filter(s => s.t !== '');
  }

  function measure(g, segs) {
    return segs.reduce((a, s) => a + g.measureText(s.t).width, 0);
  }

  function fitSize(g, segsList, fontOf, maxW, start, min) {
    let size = Math.round(start);
    while (size > min) {
      g.font = fontOf(size);
      const ok = segsList.every(segs => !segs.length || measure(g, segs) <= maxW);
      if (ok) break;
      size -= 2;
    }
    return Math.max(min, size);
  }

  function effects() {
    return {
      strokeOn: S.strokeOn,
      strokeWidth: S.strokeWidth,
      shadowOn: S.shadowOn,
      shadowBlur: S.shadowBlur,
      shadowY: S.shadowY,
      shadowOpacity: S.shadowOpacity / 100
    };
  }

  /* 한 줄: 조각별 색 + 외곽선 + 그림자 */
  function drawLine(g, segs, x, y, size, weight, family, opt) {
    g.font = `${weight} ${size}px ${family}`;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    const strokeW = opt.strokeOn ? opt.strokeWidth : 0;
    let cx = x;
    for (const s of segs) {
      g.save();
      if (opt.shadowOn && opt.shadowOpacity > 0) {
        g.shadowColor = `rgba(0,0,0,${opt.shadowOpacity})`;
        g.shadowBlur = opt.shadowBlur;
        g.shadowOffsetY = opt.shadowY;
      }
      if (strokeW > 0) {
        g.lineJoin = 'round';
        g.miterLimit = 2;
        g.strokeStyle = '#0b0b0d';
        g.lineWidth = strokeW * 2;
        g.strokeText(s.t, cx, y);
        g.shadowColor = 'transparent';
        g.shadowBlur = 0;
        g.shadowOffsetY = 0;
      }
      const segColor = s.a ? S.accent : opt.color;
      const bf = boldFactor(weight);
      if (bf > 0) {
        g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        g.lineJoin = 'round';
        g.strokeStyle = segColor;
        g.lineWidth = size * bf;
        g.strokeText(s.t, cx, y);
      }
      g.fillStyle = segColor;
      g.fillText(s.t, cx, y);
      g.restore();
      cx += g.measureText(s.t).width;
    }
    return cx;
  }

  /* ───────── 배경(블러) / 사진 ───────── */
  let filterOK = null;
  function ctxFilterOK(g) {
    if (filterOK !== null) return filterOK;
    try {
      g.filter = 'blur(1px)';
      filterOK = g.filter === 'blur(1px)';
      g.filter = 'none';
    } catch (e) { filterOK = false; }
    return filterOK;
  }

  function drawBlurBg(g, img, blurPx, dark) {
    const ratio = 1.12;
    const sc = Math.max(W / img.width, H / img.height) * ratio;
    const dw = img.width * sc, dh = img.height * sc;
    const dx = (W - dw) / 2, dy = (H - dh) / 2;

    if (blurPx <= 0.5) {
      g.drawImage(img, dx, dy, dw, dh);
    } else if (ctxFilterOK(g)) {
      g.save();
      g.filter = `blur(${blurPx}px)`;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, dx, dy, dw, dh);
      g.restore();
      g.filter = 'none';
    } else {
      const sw = Math.max(24, Math.round(W / (1 + blurPx / 2.2)));
      const small = document.createElement('canvas');
      small.width = sw; small.height = sw;
      const s = small.getContext('2d');
      const cs = Math.max(sw / img.width, small.height / img.height) * ratio;
      s.imageSmoothingEnabled = true;
      s.imageSmoothingQuality = 'high';
      s.drawImage(img,
        (sw - img.width * cs) / 2, (small.height - img.height * cs) / 2,
        img.width * cs, img.height * cs);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(small, dx, dy, dw, dh);
    }
    if (dark > 0) {
      g.fillStyle = `rgba(0,0,0,${dark / 100})`;
      g.fillRect(0, 0, W, H);
    }
  }

  function drawPhoto(g, img, fit, trimTop, trimBottom) {
    const t = clamp(trimTop, 0, 45) / 100, b = clamp(trimBottom, 0, 45) / 100;
    const sy = img.height * t;
    const srcH = Math.max(8, img.height * (1 - t - b));
    const srcW = img.width;
    const sc = fit === 'cover'
      ? Math.max(W / srcW, H / srcH)
      : Math.min(W / srcW, H / srcH);
    const dw = srcW * sc, dh = srcH * sc;
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, sy, srcW, srcH, (W - dw) / 2, (H - dh) / 2, dw, dh);
    g.restore();
  }

  function drawScrim(g, heightPct, opacityPct) {
    const h = H * clamp(heightPct, 0, 100) / 100;
    const o = clamp(opacityPct, 0, 100) / 100;
    if (h <= 0 || o <= 0) return;
    const grd = g.createLinearGradient(0, H - h, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.45, `rgba(0,0,0,${o * 0.35})`);
    grd.addColorStop(0.78, `rgba(0,0,0,${o * 0.78})`);
    grd.addColorStop(1, `rgba(0,0,0,${o})`);
    g.fillStyle = grd;
    g.fillRect(0, H - h, W, h);
  }

  /* ───────── ① 카드 ───────── */
  function drawCard(g, img) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d0e12';
    g.fillRect(0, 0, W, H);

    drawBlurBg(g, img, S.blur, S.dark);
    drawPhoto(g, img, S.fit, S.trimTop, S.trimBottom);

    if (S.textMode !== 'none') {
      drawScrim(g, S.scrim, S.scrimOpacity);
      if (S.textMode === 'thumb') drawThumbText(g);
      else drawCommentText(g);
    }
  }

  function drawThumbText(g) {
    const k = clamp(S.scale, 60, 160) / 100;
    const padX = 72, barW = 12, gap = 26;
    const textX = padX + barW + gap;
    const maxW = W - textX - 56;
    const bottomPad = 84;

    const lines = [S.title1, S.title2]
      .map(t => (t || '').trim())
      .filter(Boolean)
      .map(t => segments(t, S.hlWords));
    const subText = (S.sub || '').trim();
    if (!lines.length && !subText) return;

    const opt = { ...effects(), color: '#ffffff' };
    const fontOf = (size) => `400 ${size}px ${F_BLACK}`;

    const titleSize = fitSize(g, lines, fontOf, maxW, Math.round(96 * k), Math.round(32 * k));
    const lh = titleSize * 1.16;
    const titleH = lines.length ? lh * lines.length : 0;

    const subSize = Math.round(38 * k);
    const subGap = 22 * k;
    const subH = subText ? subSize * 1.2 : 0;

    const blockH = titleH + (subText ? subGap + subH : 0);
    const top = H - bottomPad - blockH;

    if (lines.length) {
      g.save();
      g.fillStyle = S.accent;
      const bh = Math.max(titleSize * 0.8, titleH - lh * 0.18);
      roundRect(g, padX, top + lh * 0.1, barW, bh, barW / 2);
      g.fill();
      g.restore();
    }

    let y = top;
    for (const segs of lines) {
      drawLine(g, segs, textX, y, titleSize, 400, F_BLACK, opt);
      y += lh;
    }

    if (subText) {
      const subOpt = {
        ...effects(),
        color: '#ECEDF3',
        strokeWidth: Math.max(0, S.strokeWidth - 2),
        shadowOpacity: effects().shadowOpacity * 0.85
      };
      drawLine(g, [{ t: subText, a: false }], textX + 2, top + titleH + subGap,
        subSize, 500, F_NOTO, subOpt);
    }
  }

  function drawCommentText(g) {
    const k = clamp(S.scale, 60, 160) / 100;
    const barH = 196 * k;
    const barTop = H - barH;

    g.save();
    g.fillStyle = 'rgba(11,12,16,.82)';
    g.fillRect(0, barTop, W, barH);
    g.restore();

    const text = (S.comment || '').trim() || '한 줄 코멘트를 입력하세요';
    const padX = 72, accentW = 8, gap = 26;
    const maxW = W - (padX + accentW + gap) - 56;
    const fontOf = (size) => `700 ${size}px ${F_NOTO}`;
    const size = fitSize(g, [[{ t: text, a: false }]], fontOf, maxW, Math.round(54 * k), 26);

    g.save();
    g.fillStyle = S.accent;
    const bh = 58 * k;
    roundRect(g, padX, barTop + (barH - bh) / 2, accentW, bh, accentW / 2);
    g.fill();
    g.restore();

    drawLine(g, [{ t: text, a: false }], padX + accentW + gap,
      barTop + (barH - size * 1.02) / 2, size, 700, F_NOTO,
      { ...effects(), color: '#ffffff' });
  }

  /* ───────── ② 아웃트로 ───────── */
  function outroHeight() { return S.outroRatio === '4:5' ? 1350 : 1080; }

  function drawOutro(g, OH) {
    const BG = '#111216', SURFACE = '#1B1D24', BORDER = '#2B2E38';
    const MAIN = '#F4F5F7', SUB = '#CBD0DC', MUTED = '#7C8497';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, W, OH);

    const extra = Math.max(0, OH - 1080);   // 4:5 일 때 남는 세로 여백을 블록 사이에 나눠 넣는다
    const pad = 84;
    let y = 66;

    const text = (str, x, yy, size, weight, family, color, maxW, align) => {
      let s = size;
      g.font = `${weight} ${s}px ${family}`;
      const mw = maxW || (W - pad * 2);
      while (s > 15 && g.measureText(str).width > mw) {
        s -= 1;
        g.font = `${weight} ${s}px ${family}`;
      }
      g.textBaseline = 'top';
      g.textAlign = align || 'left';
      const bf = boldFactor(weight);
      if (bf > 0) {
        g.lineJoin = 'round';
        g.strokeStyle = color;
        g.lineWidth = s * bf;
        g.strokeText(str, x, yy);
      }
      g.fillStyle = color;
      g.fillText(str, x, yy);
      g.textAlign = 'left';
      return s;
    };

    text(S.outro.brand || ' ', pad, y, 26, 500, F_NOTO, MUTED, W - pad * 2 - 280);
    if (S.outro.label) text(S.outro.label, W - pad, y, 26, 500, F_NOTO, MUTED, 300, 'right');
    y += 46;
    g.strokeStyle = BORDER; g.lineWidth = 2;
    g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke();
    y += 60 + extra * 0.10;

    const t1 = (S.outro.title1 || '').trim();
    const t2 = (S.outro.title2 || '').trim();
    if (t1) y += text(t1, pad, y, 70, 900, F_NOTO, MAIN, W - pad * 2) * 1.32;
    if (t2) y += text(t2, pad, y, 70, 900, F_NOTO, S.accent, W - pad * 2) * 1.32;
    y += 24 + extra * 0.16;

    const nums = ['01', '02', '03'];
    const list = [S.outro.item1, S.outro.item2, S.outro.item3];
    for (let i = 0; i < 3; i++) {
      const desc = (list[i] || '').trim();
      text(nums[i], pad, y + 3, 30, 700, F_NOTO, S.accent, 60);
      if (desc) text(desc, pad + 66, y, 32, 400, F_NOTO, '#E5E7EB', W - pad * 2 - 66);
      y += 56;
      g.strokeStyle = '#2E323D'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad, y + 12); g.lineTo(W - pad, y + 12); g.stroke();
      y += 28 + extra * 0.05;
    }
    y += 34 + extra * 0.08;

    const ctaSize = 48;
    if (S.outro.cta1) y += text(S.outro.cta1, pad, y, ctaSize, 900, F_NOTO, MAIN, W - pad * 2) * 1.22;
    if (S.outro.cta2) y += text(S.outro.cta2, pad, y, ctaSize, 900, F_NOTO, MAIN, W - pad * 2) * 1.22;
    y += 30 + extra * 0.10;

    for (const ch of [S.outro.ch1, S.outro.ch2]) {
      const raw = (ch || '').trim();
      if (!raw) continue;
      const sp = raw.indexOf(' ');
      const plat = sp > 0 ? raw.slice(0, sp) : raw;
      const handle = sp > 0 ? raw.slice(sp + 1) : '';
      const used = text(plat, pad, y, 28, 400, F_NOTO, MUTED, 240);
      if (handle) {
        g.font = `400 ${used}px ${F_NOTO}`;
        const pw = g.measureText(plat).width;
        text(handle, pad + Math.max(190, pw + 40), y, 28, 400, F_NOTO, SUB, W - pad * 2 - 210);
      }
      y += 44;
    }

    const fy = OH - 88;
    g.strokeStyle = BORDER; g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, fy - 34); g.lineTo(W - pad, fy - 34); g.stroke();
    text(S.outro.foot || ' ', pad, fy, 25, 400, F_NOTO, MUTED, W - pad * 2 - 130);

    g.font = `700 24px ${F_NOTO}`;
    const pw2 = g.measureText('END').width + 46;
    const px = W - pad - pw2;
    g.fillStyle = SURFACE;
    roundRect(g, px, fy - 8, pw2, 48, 24);
    g.fill();
    g.strokeStyle = BORDER; g.lineWidth = 2;
    roundRect(g, px, fy - 8, pw2, 48, 24);
    g.stroke();
    g.fillStyle = SUB;
    g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText('END', px + 23, fy + 2);
  }

  /* ───────── 렌더 ───────── */
  function render() {
    const g = canvas.getContext('2d');
    if (S.tab === 'outro') {
      const OH = outroHeight();
      if (canvas.height !== OH) canvas.height = OH;
      canvas.width = W;
      $('stage').style.aspectRatio = `1080 / ${OH}`;
      drawOutro(g, OH);
      $('stageEmpty').hidden = true;
      $('zipBtn').disabled = true;
      $('pngBtn').disabled = false;
      $('outroSizeTxt').textContent = `1080 × ${OH}`;
      $('dims').textContent = `1080 × ${OH} · 아웃트로`;
      if (!fontsReady) note('폰트 불러오는 중…');
      return;
    }
    if (canvas.height !== H) canvas.height = H;
    if (canvas.width !== W) canvas.width = W;
    $('stage').style.aspectRatio = '1 / 1';
    $('dims').textContent = '1080 × 1080';
    if (active < 0 || !items[active]) {
      g.clearRect(0, 0, W, H);
      $('stageEmpty').hidden = false;
      $('pngBtn').disabled = true;
      $('zipBtn').disabled = items.length === 0;
      return;
    }
    drawCard(g, items[active].img);
    $('pngBtn').disabled = false;
    $('zipBtn').disabled = items.length === 0;
  }

  /* ───────── 저장 ───────── */
  async function savePNG() {
    if (S.tab !== 'outro' && (active < 0 || !items[active])) { toast('먼저 사진을 넣어 주세요'); return null; }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) { toast('저장 실패 — 다시 시도해 주세요'); return null; }
    const name = S.tab === 'outro' ? `outro-${stamp()}.png` : `card-${stamp()}.png`;
    download(blob, name);
    toast(`PNG 저장 · ${name}`);
    return { blob, name };
  }

  async function buildZipBlob(onProgress) {
    const zip = new JSZip();
    for (let i = 0; i < items.length; i++) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawCard(c.getContext('2d'), items[i].img);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      zip.file(`${String(i + 1).padStart(2, '0')}_${safeName(items[i].name)}.png`, blob);
      if (onProgress) onProgress(i + 1, items.length);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  async function saveZip() {
    if (!items.length) return;
    if (!window.JSZip) { toast('ZIP 라이브러리를 못 불러왔어요 — 잠시 뒤 다시'); return; }
    const btn = $('zipBtn');
    btn.disabled = true;
    const old = btn.textContent;
    try {
      const blob = await buildZipBlob((n, t) => { btn.textContent = `ZIP ${n}/${t}`; });
      const name = `cards-${stamp()}.zip`;
      download(blob, name);
      toast(`${items.length}장 ZIP 저장 · ${name}`);
    } catch (e) {
      toast('ZIP 만들기 실패 — 다시 시도해 주세요');
    } finally {
      btn.textContent = old;
      btn.disabled = items.length === 0;
    }
  }

  /* ───────── UI ───────── */
  function bindRange(id, key, fmt) {
    const el = $(id);
    const out = $(id + 'Val');
    el.addEventListener('input', () => {
      S[key] = Number(el.value);
      if (out) out.textContent = fmt(S[key]);
      save(); render();
    });
  }

  function bindText(id, key, isOutro) {
    const el = $(id);
    el.addEventListener('input', () => {
      (isOutro ? S.outro : S)[key] = el.value;
      save(); render();
    });
  }

  function syncInputs() {
    $('blur').value = S.blur;
    $('dark').value = S.dark;
    $('trimTop').value = S.trimTop;
    $('trimBottom').value = S.trimBottom;
    $('scale').value = S.scale;
    $('scrim').value = S.scrim;
    $('scrimOpacity').value = S.scrimOpacity;
    $('strokeOn').checked = S.strokeOn;
    $('strokeWidth').value = S.strokeWidth;
    $('shadowOn').checked = S.shadowOn;
    $('shadowBlur').value = S.shadowBlur;
    $('shadowY').value = S.shadowY;
    $('shadowOpacity').value = S.shadowOpacity;
    $('blurVal').textContent = S.blur;
    $('darkVal').textContent = S.dark + '%';
    $('trimTopVal').textContent = S.trimTop + '%';
    $('trimBottomVal').textContent = S.trimBottom + '%';
    $('scaleVal').textContent = S.scale + '%';
    $('scrimVal').textContent = S.scrim + '%';
    $('scrimOpacityVal').textContent = S.scrimOpacity + '%';
    $('strokeWidthVal').textContent = S.strokeWidth + 'px';
    $('shadowVal').textContent = S.shadowBlur + 'px';
    $('shadowOpacityVal').textContent = S.shadowOpacity + '%';

    $('title1').value = S.title1;
    $('title2').value = S.title2;
    $('sub').value = S.sub;
    $('hlWords').value = S.hlWords;
    $('comment').value = S.comment;

    const map = [['oBrand', 'brand'], ['oLabel', 'label'], ['oTitle1', 'title1'], ['oTitle2', 'title2'],
      ['oItem1', 'item1'], ['oItem2', 'item2'], ['oItem3', 'item3'],
      ['oCta1', 'cta1'], ['oCta2', 'cta2'], ['oCh1', 'ch1'], ['oCh2', 'ch2'], ['oFoot', 'foot']];
    for (const [id, key] of map) $(id).value = S.outro[key];

    document.querySelectorAll('#outroRatioSeg button').forEach(b =>
      b.addEventListener('click', () => {
        S.outroRatio = b.dataset.ratio;
        document.querySelectorAll('#outroRatioSeg button').forEach(x => x.classList.toggle('on', x === b));
        save(); render();
      }));

    document.querySelectorAll('#fitSeg button').forEach(b => b.classList.toggle('on', b.dataset.fit === S.fit));
    document.querySelectorAll('#textSeg button').forEach(b => b.classList.toggle('on', b.dataset.text === S.textMode));
    document.querySelectorAll('#outroRatioSeg button').forEach(b => b.classList.toggle('on', b.dataset.ratio === S.outroRatio));
    document.querySelectorAll('[data-when]').forEach(el => { el.hidden = el.dataset.when !== S.textMode; });
    applyAccentUI();
  }

  function applyAccentUI() {
    const root = document.documentElement.style;
    root.setProperty('--accent', S.accent);
    root.setProperty('--accent-soft', hexA(S.accent, 0.14));
    root.setProperty('--accent-line', hexA(S.accent, 0.45));
    $('accentHex').textContent = S.accent.toUpperCase();
    $('accentPicker').value = S.accent;
    $('accentPickerOutro').value = S.accent;
    for (const box of ['swatches', 'swatchesOutro']) {
      document.querySelectorAll(`#${box} button`).forEach(b =>
        b.classList.toggle('on', (b.dataset.color || '').toLowerCase() === S.accent.toLowerCase()));
    }
  }

  function setAccent(hex) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    S.accent = hex.toUpperCase();
    applyAccentUI();
    save(); render();
  }

  function switchTab(tab) {
    const b = document.querySelector(`.modes button[data-tab="${tab}"]`);
    if (b) b.click();
  }

  function init() {
    restore();
    syncInputs();
    renderThumbs();
    render();

    bindRange('blur', 'blur', v => v);
    bindRange('dark', 'dark', v => v + '%');
    bindRange('trimTop', 'trimTop', v => v + '%');
    bindRange('trimBottom', 'trimBottom', v => v + '%');
    bindRange('scale', 'scale', v => v + '%');
    bindRange('scrim', 'scrim', v => v + '%');
    bindRange('scrimOpacity', 'scrimOpacity', v => v + '%');
    bindRange('strokeWidth', 'strokeWidth', v => v + 'px');
    bindRange('shadowBlur', 'shadowBlur', v => v + 'px');
    bindRange('shadowY', 'shadowY', v => v + 'px');
    bindRange('shadowOpacity', 'shadowOpacity', v => v + '%');

    $('strokeOn').addEventListener('change', e => { S.strokeOn = e.target.checked; save(); render(); });
    $('shadowOn').addEventListener('change', e => { S.shadowOn = e.target.checked; save(); render(); });

    ['title1', 'title2', 'sub', 'hlWords', 'comment'].forEach(id => bindText(id, id, false));
    [['oBrand', 'brand'], ['oLabel', 'label'], ['oTitle1', 'title1'], ['oTitle2', 'title2'],
      ['oItem1', 'item1'], ['oItem2', 'item2'], ['oItem3', 'item3'],
      ['oCta1', 'cta1'], ['oCta2', 'cta2'], ['oCh1', 'ch1'], ['oCh2', 'ch2'], ['oFoot', 'foot']
    ].forEach(([id, key]) => bindText(id, key, true));

    document.querySelectorAll('#fitSeg button').forEach(b =>
      b.addEventListener('click', () => {
        S.fit = b.dataset.fit;
        document.querySelectorAll('#fitSeg button').forEach(x => x.classList.toggle('on', x === b));
        save(); render();
      }));

    document.querySelectorAll('#textSeg button').forEach(b =>
      b.addEventListener('click', () => {
        S.textMode = b.dataset.text;
        document.querySelectorAll('#textSeg button').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll('[data-when]').forEach(el => { el.hidden = el.dataset.when !== S.textMode; });
        save(); render();
      }));

    for (const box of ['swatches', 'swatchesOutro']) {
      document.querySelectorAll(`#${box} button`).forEach(b =>
        b.addEventListener('click', () => setAccent(b.dataset.color)));
    }
    $('accentPicker').addEventListener('input', e => setAccent(e.target.value));
    $('accentPickerOutro').addEventListener('input', e => setAccent(e.target.value));

    document.querySelectorAll('.modes button').forEach(b =>
      b.addEventListener('click', () => {
        S.tab = b.dataset.tab;
        document.querySelectorAll('.modes button').forEach(x => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-selected', x === b ? 'true' : 'false');
        });
        $('panelCard').hidden = S.tab !== 'card';
        $('panelOutro').hidden = S.tab !== 'outro';
        renderThumbs();
        render();
        toEndAnchor();
      }));

    $('pickBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

    const stage = $('stage');
    stage.addEventListener('click', () => { if (!items.length && S.tab === 'card') $('fileInput').click(); });
    ['dragenter', 'dragover'].forEach(ev =>
      stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove('drag'); }));
    stage.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        if (S.tab !== 'card') switchTab('card');
        addFiles(e.dataTransfer.files);
      }
    });
    document.addEventListener('paste', e => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files || []);
      if (files.length) {
        if (S.tab !== 'card') switchTab('card');
        addFiles(files);
      }
    });

    $('clearBtn').addEventListener('click', () => {
      items.forEach(it => URL.revokeObjectURL(it.url));
      items.length = 0;
      active = -1;
      renderThumbs(); render();
      note('사진을 넣으면 바로 1:1 블러 카드가 만들어집니다.');
    });

    $('pngBtn').addEventListener('click', savePNG);
    $('zipBtn').addEventListener('click', saveZip);

    // 폰트
    const fs = $('fontState');
    fs.classList.add('wait');
    fs.textContent = '폰트 준비 중…';
    // 한글 서브셋까지 실제로 받아오려면 샘플 한글 문자열을 넘겨야 한다
    // (문자열 없이 load() 하면 라틴 서브셋만 받아 캔버스가 대체 폰트로 그려짐)
    const KO = '가나다라마바사아자차카타파하 짤 모음 0123';
    Promise.allSettled([
      document.fonts.load('400 64px "Black Han Sans"', KO),
      document.fonts.load('400 64px "Noto Sans KR"', KO),
      document.fonts.load('500 64px "Noto Sans KR"', KO),
      document.fonts.load('700 64px "Noto Sans KR"', KO),
      document.fonts.load('900 64px "Noto Sans KR"', KO)
    ]).then(() => document.fonts.ready).then(() => {
      const hasBlack = document.fonts.check('400 70px "Black Han Sans"', '짤');
      detectSyntheticBold();
      fontsReady = hasBlack;
      fs.classList.remove('wait');
      fs.textContent = hasBlack ? '폰트 준비 완료' : '일부 폰트 대체됨';
      render();
    }).catch(() => {
      fs.textContent = '기본 폰트로 표시';
      render();
    });

    window.__cm = { S, items, render, buildZipBlob, savePNG, saveZip, addFiles, setAccent, switchTab };

    // 탭 전환 시 컨트롤 상단으로 스크롤 (모바일)
    function toEndAnchor() {
      if (window.matchMedia('(max-width: 980px)').matches) {
        $('panelCard').hidden ? $('panelOutro').scrollIntoView({ behavior: 'smooth', block: 'start' })
          : $('panelCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
