/* 1:1 블러 카드 메이커 — app.js
   사진 → 1080×1080 블러 배경 + 썸네일/코멘트 문구 + 아웃트로 카드.
   모든 처리는 브라우저 안에서만 하고 어디로도 보내지 않는다. */
(() => {
  'use strict';

  const W = 1080, H = 1080;
  const F_BLACK = '"Black Han Sans", "Noto Sans KR", sans-serif';
  const F_NOTO = '"Noto Sans KR", -apple-system, "Malgun Gothic", sans-serif';
  const BAR_BG = '#070c08';    // 하단 검정창 바탕
  const BAR_SKEW = 11;         // 기울임 각도(도)

  const $ = (id) => document.getElementById(id);
  const canvas = $('stageCanvas');

  /* ───────── 상태 ───────── */
  const S = {
    tab: 'card',
    layout: 'blur',      // 'blur' = 1:1 블러 카드, 'bar' = 하단 검정창
    barPct: 33,          // 검정창이 차지하는 높이(%)
    barFadeOn: true,     // 검정창 위쪽을 그라데이션으로 사진과 이어 붙이기
    skewOn: true,        // 제목 오른쪽 기울임
    barGapOn: true,      // 사진과 검정창 사이 흰 구분선
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
    // ④ 마무리(동물촌) — 반투명 크림 카드
    glassPct: 86,          // 크림 카드 진하기(%)
    glassBlur: 22,         // 카드 뒤 배경 흐림(px)
    animalAccent: '#F97316',
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
      ch3: '리틀리 litt.ly/anchirong',
      foot: '프로필 링크에서 짤 속 아이템 모아보기'
    },
    // ⑤ 심플 엔딩 — 사진 꽉 채우고 아래 가운데 두 줄 + 오른쪽 아래 채널 태그
    simpleBlur: 0,
    simpleDark: 0,
    simpleGradOn: true,
    simpleGradPct: 38,
    simpleGradDark: 90,
    simpleScale: 100,
    simpleBottom: 96,
    simpleStroke: true,
    simpleStrokeW: 3,
    simpleShadow: true,
    simpleChSize: 25,
    simpleChGap: 56,
    simple: {
      line1: '여러분은 어떻게 생각하시나요?',
      line2: '댓글로 의견을 남겨주세요!',
      chans: 'YouTube · 싱글벙글 동물촌\nTikTok · @animallolvillage\n리틀리 · litt.ly/anchirong'
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
        if (k === 'tab' || k === 'outro' || k === 'simple') continue;
        if (d[k] !== undefined) S[k] = d[k];
      }
      if (d.outro) Object.assign(S.outro, d.outro);
      if (d.simple) Object.assign(S.simple, d.simple);
      // 예전 기본값(영어 헤더)만 국문 브랜드로 옮긴다 — 미니멀 카드는 영어 헤더를 쓰지 않음
      if (S.outro.brand === 'SINGULBUNGUL ANIMAL VILLAGE') S.outro.brand = '싱글벙글 동물촌';
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
    const isPhotoTab = S.tab === 'card' || S.tab === 'simple';
    $('countTxtS').textContent = `${items.length}장`;
    $('stageEmpty').hidden = items.length > 0 || !isPhotoTab;
    $('zipBtn').disabled = items.length === 0 || !isPhotoTab;
    $('thumbs').style.display = isPhotoTab ? '' : 'none';
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
    if (S.layout === 'bar') { drawBarCard(g, img); return; }
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

  /* ───────── ①-b 하단 검정창 ───────── */
  function barMetrics() {
    const barH = Math.round(H * clamp(S.barPct, 10, 55) / 100);
    const gap = S.barGapOn ? Math.round(H * 0.022) : 0;   // 사진과 창 사이 흰 줄
    const photoH = H - barH;
    return { barH, gap, photoH, winTop: photoH + gap, winH: barH - gap };
  }

  function drawBarCard(g, img) {
    const m = barMetrics();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0d0e12';
    g.fillRect(0, 0, W, H);

    // 위쪽: 사진이 가로로 꽉 차게
    const t = clamp(S.trimTop, 0, 45) / 100, b = clamp(S.trimBottom, 0, 45) / 100;
    const srcY = img.height * t;
    const srcH = Math.max(8, img.height * (1 - t - b));
    const srcW = img.width;
    const sc = Math.max(W / srcW, m.photoH / srcH);
    const ow = srcW * sc, oh = srcH * sc;
    const dx = (W - ow) / 2, dy = (m.photoH - oh) / 2;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, m.photoH);
    g.clip();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, srcY, srcW, srcH, dx, dy, ow, oh);
    g.restore();

    if (S.barFadeOn) {
      // 사진 아래쪽이 검정으로 녹아들고, 그 아래가 진한 검정 바탕 — 딱 끊기는 경계 없이 이어진다
      const fadeH = Math.min(m.photoH, Math.max(120, Math.round(m.barH * 0.85)));
      const fadeTop = m.photoH - fadeH;
      const grd = g.createLinearGradient(0, fadeTop, 0, m.photoH);
      grd.addColorStop(0, 'rgba(7,12,8,0)');
      grd.addColorStop(0.40, 'rgba(7,12,8,0.16)');
      grd.addColorStop(0.70, 'rgba(7,12,8,0.55)');
      grd.addColorStop(0.88, 'rgba(7,12,8,0.85)');
      grd.addColorStop(1, 'rgba(7,12,8,1)');
      g.fillStyle = grd;
      g.fillRect(0, fadeTop, W, fadeH);
      g.fillStyle = BAR_BG;
      g.fillRect(0, m.photoH, W, H - m.photoH);
    } else {
      if (m.gap > 0) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, m.photoH, W, m.gap);
      }
      g.fillStyle = BAR_BG;
      g.fillRect(0, m.winTop, W, m.winH);
    }

    if (S.textMode !== 'none') drawBarText(g, m.winTop, m.winH);
  }

  /* 글자 잉크가 'top' 기준 y에서 얼마나 아래에서 시작하는지(패딩)와 잉크 높이.
     em 박스 대신 실제 잉크 기준으로 세로 가운데를 맞추는 데 쓴다. */
  function inkBox(g, text, size, weight, family) {
    g.save();
    g.font = `${weight} ${size}px ${family}`;
    g.textBaseline = 'alphabetic';
    const m = g.measureText(text || '한');
    g.restore();
    const fb = m.fontBoundingBoxAscent || size * 0.88;
    const asc = m.actualBoundingBoxAscent || size * 0.72;
    const desc = m.actualBoundingBoxDescent || 0;
    return { pad: Math.max(0, fb - asc), h: asc + desc };
  }

  /* 검정 창 가운데: 굵은 기울임 두 줄(+서브 한 줄) */
  function drawBarText(g, top, height) {
    const k = clamp(S.scale, 60, 160) / 100;
    const lines = [S.title1, S.title2]
      .map(t => (t || '').trim())
      .filter(Boolean)
      .map(t => segments(t, S.hlWords));
    const subText = (S.sub || '').trim();
    if (!lines.length && !subText) return;

    const padX = 54;
    const maxW = W - padX * 2;
    const fontOf = (size) => `400 ${size}px ${F_BLACK}`;
    const size = fitSize(g, lines, fontOf, maxW, Math.round(132 * k), Math.round(34 * k));
    const lh = size * 1.14;

    const subSize = Math.round(40 * k);
    const subGap = 24 * k;

    const opt = {
      ...effects(),
      shadowOn: false,          // 검정 바탕 위라 그림자는 의미 없음
      color: '#ffffff',
      strokeWidth: Math.min(28, Math.round(S.strokeWidth * 1.9))
    };
    const shear = S.skewOn ? -Math.tan((BAR_SKEW * Math.PI) / 180) : 0;  // 음수 = 오른쪽으로 기움

    // 실제 잉크 기준으로 세로 가운데 정렬
    const titleInk = inkBox(g, lines.length ? lines[0].map(s => s.t).join('') : '한', size, 400, F_BLACK);
    const titleInkH = lines.length ? (lines.length - 1) * lh + titleInk.h : 0;
    const subInk = subText ? inkBox(g, subText, subSize, 500, F_NOTO) : null;
    const visualH = titleInkH + (subInk ? subGap + subInk.h : 0);

    const inkTop = top + Math.max(8, (height - visualH) / 2);
    let y = inkTop - titleInk.pad;
    for (const segs of lines) {
      g.font = `400 ${size}px ${F_BLACK}`;
      const tw = measure(g, segs);
      const x = (W - tw) / 2;
      if (shear) {
        const cy = y + size / 2;
        g.save();
        g.translate(W / 2, cy);
        g.transform(1, 0, shear, 1, 0, 0);
        g.translate(-W / 2, -cy);
        drawLine(g, segs, x, y, size, 400, F_BLACK, opt);
        g.restore();
      } else {
        drawLine(g, segs, x, y, size, 400, F_BLACK, opt);
      }
      y += lh;
    }

    if (subText && subInk) {
      const subOpt = {
        ...effects(),
        shadowOn: false,
        color: '#DCE0E8',
        strokeWidth: Math.max(0, Math.round(S.strokeWidth * 0.9))
      };
      g.font = `500 ${subSize}px ${F_NOTO}`;
      const sw = g.measureText(subText).width;
      drawLine(g, [{ t: subText, a: false }], (W - sw) / 2,
        inkTop + titleInkH + subGap - subInk.pad,
        subSize, 500, F_NOTO, subOpt);
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

  /* ③ 미니멀 카드 — 가운데 정렬 · 01·02·03 요약 없음 · 영어 헤더/END 없음 */
  function drawOutroMinimal(g, OH) {
    const BG = '#111216';
    const MAIN = '#F4F5F7', SUB = '#CBD0DC', MUTED = '#7C8497';
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, W, OH);

    const k = OH / 1080;                       // 4:5 는 비율대로 조금 더 여유 있게
    const fate = (str, y, size, weight, color, maxW, track) => {
      let s = size;
      g.font = `${weight} ${s}px ${F_NOTO}`;
      const mw = maxW || W - 160;
      while (s > 15 && g.measureText(str).width > mw) {
        s -= 1;
        g.font = `${weight} ${s}px ${F_NOTO}`;
      }
      g.textBaseline = 'top';
      g.textAlign = 'left';
      if (track) {
        const chars = [...str];
        const ws = chars.map(c => g.measureText(c).width);
        const total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
        let x = (W - total) / 2;
        g.fillStyle = color;
        chars.forEach((c, i) => { g.fillText(c, x, y); x += ws[i] + track; });
        return s;
      }
      g.textAlign = 'center';
      const bf = boldFactor(weight);
      if (bf > 0) {
        g.lineJoin = 'round';
        g.strokeStyle = color;
        g.lineWidth = s * bf;
        g.strokeText(str, W / 2, y);
      }
      g.fillStyle = color;
      g.fillText(str, W / 2, y);
      g.textAlign = 'left';
      return s;
    };

    // 상단: 브랜드 + 라일락 짧은 바
    const brand = (S.outro.brand || '').trim();
    if (brand) fate(brand, 146 * k, 31, 500, MAIN, W - 200, 5);
    const barW = 62, barY = 146 * k + 68;
    g.fillStyle = S.accent;
    roundRect(g, (W - barW) / 2, barY, barW, 3, 1.5);
    g.fill();

    // 중앙: 마무리 문구
    const ctaSize = 58;
    if ((S.outro.cta1 || '').trim()) fate(S.outro.cta1.trim(), 452 * k, ctaSize, 800, MAIN, W - 200);
    if ((S.outro.cta2 || '').trim()) fate(S.outro.cta2.trim(), 452 * k + 71, ctaSize, 800, S.accent, W - 200);

    // 하단: 채널 3줄 (가운데 정렬 · 플랫폼/핸들 색 구분)
    let y = 742 * k;
    for (const raw of [S.outro.ch1, S.outro.ch2, S.outro.ch3]) {
      const line = (raw || '').trim();
      if (!line) { y += 50; continue; }
      const sp = line.indexOf(' ');
      const plat = sp > 0 ? line.slice(0, sp) : line;
      const handle = sp > 0 ? line.slice(sp + 1) : '';
      g.font = `400 26px ${F_NOTO}`;
      g.textBaseline = 'top';
      const pw = g.measureText(plat).width;
      const hw = handle ? g.measureText(handle).width : 0;
      const gap = 18;
      let x = (W - (pw + (handle ? gap + hw : 0))) / 2;
      g.fillStyle = MUTED;
      g.fillText(plat, x, y);
      if (handle) {
        g.fillStyle = SUB;
        g.fillText(handle, x + pw + gap, y);
      }
      y += 50;
    }

    // 맨 아래 아주 작게
    const foot = (S.outro.foot || '').trim();
    if (foot) fate(foot, OH - 84, 20, 400, MUTED, W - 160);
  }

  /* ───────── ④ 마무리(동물촌) ───────── */
  const ANIMAL_BG_SRC = 'assets/outro-dongmulchon-bg.jpg';
  const animalBg = new Image();
  let animalBgReady = false;
  animalBg.addEventListener('load', () => {
    animalBgReady = true;
    if (S.tab === 'animal') render();
  });
  animalBg.addEventListener('error', () => { animalBgReady = false; });
  animalBg.src = ANIMAL_BG_SRC;

  // 같은 배경·흐림 값일 땐 유리·그림자 레이어를 다시 만들지 않는다(폰에서 슬라이더가 부드럽게)
  const animalCache = { key: '', glass: null, shadow: null };

  /* 1080×1080 고정 — 3D 꽃밭 마을 배경 + 반투명 크림 카드 */
  function drawAnimalCard(g) {
    const AH = 1080;
    const CARD = { x: 96, y: 140, w: 888, h: 522, r: 44 };
    const CREAM = '#FFF9EC';
    const CHARCOAL = '#22252A';
    const BROWN = '#685A44';
    const PLAT = '#80715A';
    const FOOT = '#70624C';
    const LINE = '#E2D4B8';
    const GREEN = '#7BC043';
    const ACCENT = S.animalAccent || '#F97316';

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, AH);

    // 배경 (1:1 cover)
    if (animalBgReady) {
      const iw = animalBg.naturalWidth || W, ih = animalBg.naturalHeight || AH;
      const sc = Math.max(W / iw, AH / ih);
      const dw = iw * sc, dh = ih * sc;
      g.drawImage(animalBg, (W - dw) / 2, (AH - dh) / 2, dw, dh);
    } else {
      const gr = g.createLinearGradient(0, 0, 0, AH);
      gr.addColorStop(0, '#FBE7C8');
      gr.addColorStop(0.55, '#FDF0D8');
      gr.addColorStop(1, '#B9CE86');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, AH);
    }

    // 카드 뒤 부드러운 그림자 (블러 레이어 — 한 번만 만든다)
    if (!animalCache.shadow) {
      const SM0 = 110;
      const sc0 = document.createElement('canvas');
      sc0.width = CARD.w + SM0 * 2;
      sc0.height = CARD.h + SM0 * 2 + 20;
      const sg0 = sc0.getContext('2d');
      sg0.filter = 'blur(28px)';
      sg0.fillStyle = 'rgba(84,60,24,.30)';
      roundRect(sg0, SM0, SM0 + 14, CARD.w, CARD.h, CARD.r);
      sg0.fill();
      animalCache.shadow = sc0;
    }
    const SM = 110;
    g.drawImage(animalCache.shadow, CARD.x - SM, CARD.y - SM);

    // 반투명 크림 카드 = 카드 뒤 배경 흐림 + 크림 덮기
    const M = 90;
    const sx = Math.max(0, CARD.x - M), sy = Math.max(0, CARD.y - M);
    const ex = Math.min(W, CARD.x + CARD.w + M), ey = Math.min(AH, CARD.y + CARD.h + M);
    const rw = Math.max(1, ex - sx), rh = Math.max(1, ey - sy);
    const blur = Math.max(0, Number(S.glassBlur) || 0);
    const cacheKey = `${blur}|${animalBgReady ? 1 : 0}`;
    if (animalCache.key !== cacheKey || !animalCache.glass) {
      const glass = document.createElement('canvas');
      glass.width = rw; glass.height = rh;
      const gg = glass.getContext('2d');
      if (blur > 0 && typeof gg.filter === 'string') {
        gg.filter = `blur(${blur}px)`;
        gg.drawImage(canvas, sx, sy, rw, rh, 0, 0, rw, rh);
        gg.filter = 'none';
      } else {
        gg.drawImage(canvas, sx, sy, rw, rh, 0, 0, rw, rh);
      }
      animalCache.glass = glass;
      animalCache.key = cacheKey;
    }
    g.save();
    g.beginPath();
    roundRect(g, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
    g.clip();
    g.drawImage(animalCache.glass, sx, sy);
    g.fillStyle = hexA(CREAM, clamp(Number(S.glassPct) || 0, 0, 100) / 100);
    g.fillRect(CARD.x, CARD.y, CARD.w, CARD.h);
    g.restore();

    // 카드 테두리
    g.save();
    g.strokeStyle = 'rgba(255,255,252,.45)';
    g.lineWidth = 2;
    roundRect(g, CARD.x, CARD.y, CARD.w, CARD.h, CARD.r);
    g.stroke();
    g.restore();

    // 잉크 기준 가운데 정렬 텍스트
    const ink = (str, cx, cy, size, weight, family, color, track) => {
      g.font = `${weight} ${size}px ${family}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      if (track) {
        const chars = [...str];
        const ws = chars.map(c => g.measureText(c).width);
        const total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
        let x = cx - total / 2;
        g.fillStyle = color;
        chars.forEach((c, i) => { g.fillText(c, x, cy); x += ws[i] + track; });
        return;
      }
      g.textAlign = 'center';
      g.fillStyle = color;
      g.fillText(str, cx, cy);
      g.textAlign = 'left';
    };

    const brand = (S.outro.brand || '').trim();
    if (brand) ink(brand, W / 2, 214, 42, 400, F_BLACK, CHARCOAL, 5);

    // 짧은 구분선 + 초록 점
    const ly = 262;
    g.fillStyle = '#E0D0B2';
    roundRect(g, W / 2 - 34, ly - 1.5, 26, 3, 2);
    g.fill();
    roundRect(g, W / 2 + 8, ly - 1.5, 26, 3, 2);
    g.fill();
    g.beginPath();
    g.arc(W / 2, ly, 5, 0, Math.PI * 2);
    g.fillStyle = GREEN;
    g.fill();

    const sub = (S.outro.cta1 || '').trim();
    if (sub) ink(sub, W / 2, 302, 29, 400, F_NOTO, BROWN);
    const cta = (S.outro.cta2 || '').trim();
    if (cta) ink(cta, W / 2, 356, 56, 400, F_BLACK, ACCENT);

    // 채널 3열 (플랫폼 · 핸들)
    const chans = [S.outro.ch1, S.outro.ch2, S.outro.ch3]
      .map(s => (s || '').trim()).filter(Boolean);
    const dots = [ACCENT, CHARCOAL, GREEN];
    const colsFor = (n) => (n === 3 ? [W * 0.255, W * 0.5, W * 0.745]
      : n === 2 ? [W * 0.33, W * 0.67] : [W * 0.5]);
    const cols = colsFor(chans.length);
    chans.forEach((line, i) => {
      const cx0 = cols[i];
      const sp = line.indexOf(' ');
      const plat = sp > 0 ? line.slice(0, sp) : '';
      const handle = sp > 0 ? line.slice(sp + 1).trim() : line;
      if (plat) {
        g.font = `400 20px ${F_NOTO}`;
        const pw = g.measureText(plat).width;
        const total = 8 + 12 + pw;
        const start = cx0 - total / 2;
        g.beginPath();
        g.arc(start + 4, 448, 4, 0, Math.PI * 2);
        g.fillStyle = dots[i] || CHARCOAL;
        g.fill();
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = PLAT;
        g.fillText(plat, start + 20, 448);
      }
      g.font = `500 26px ${F_NOTO}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = CHARCOAL;
      g.fillText(handle, cx0, 488);
      g.textAlign = 'left';
    });

    // 구분선 + 하단 문구
    g.fillStyle = 'rgba(226,212,184,.85)';
    g.fillRect(CARD.x + 70, 552, CARD.w - 140, 2);
    const foot = (S.outro.foot || '').trim();
    if (foot) ink(foot, W / 2, 594, 21, 400, F_NOTO, FOOT);
  }

  function drawOutro(g, OH) {
    if (S.tab === 'minimal') { drawOutroMinimal(g, OH); return; }
    if (S.tab === 'animal') { drawAnimalCard(g); return; }
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
    y += 24 + extra * 0.10;

    for (const ch of [S.outro.ch1, S.outro.ch2, S.outro.ch3]) {
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
      y += 42;
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

  /* ───────── ⑤ 심플 엔딩 ───────── */
  const SIMPLE_BG = '#111216';

  /* 아래 35~40%를 자연스럽게 어둡게 — 사진 위 글씨 가독성 */
  function drawSimpleGradient(g) {
    if (!S.simpleGradOn) return;
    const h = H * clamp(Number(S.simpleGradPct) || 0, 5, 100) / 100;
    const o = clamp(Number(S.simpleGradDark) || 0, 0, 100) / 100;
    if (h <= 0 || o <= 0) return;
    const grd = g.createLinearGradient(0, H - h, 0, H);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.42, `rgba(0,0,0,${o * 0.42})`);
    grd.addColorStop(0.74, `rgba(0,0,0,${o * 0.80})`);
    grd.addColorStop(1, `rgba(0,0,0,${Math.min(1, o * 0.98)})`);
    g.fillStyle = grd;
    g.fillRect(0, H - h, W, h);
  }

  /* 오른쪽 정렬 한 줄 — 얇은 검은 외곽선 + 부드러운 그림자 */
  function drawSimpleTag(g, text, right, midY, size) {
    g.save();
    g.font = `700 ${size}px ${F_NOTO}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    if (S.simpleShadow) {
      g.shadowColor = 'rgba(0,0,0,.70)';
      g.shadowBlur = Math.max(6, Math.round(size * 0.45));
      g.shadowOffsetY = 2;
    }
    if (S.simpleStroke && S.simpleStrokeW > 0) {
      g.lineJoin = 'round';
      g.miterLimit = 2;
      g.lineWidth = Math.max(2, S.simpleStrokeW * 1.4);
      g.strokeStyle = 'rgba(0,0,0,.88)';
      g.strokeText(text, right, midY);
      g.shadowColor = 'transparent';
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
    }
    const bf = boldFactor(700);
    if (bf > 0) {
      g.lineJoin = 'round';
      g.lineWidth = size * bf;
      g.strokeStyle = '#ffffff';
      g.strokeText(text, right, midY);
    }
    g.fillStyle = '#ffffff';
    g.fillText(text, right, midY);
    g.restore();
  }

  /* 1080×1080 — 사진 위 가운데 두 줄 문구 + 오른쪽 아래 채널 태그 */
  function drawSimpleCard(g, img) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = SIMPLE_BG;
    g.fillRect(0, 0, W, H);

    // 사진: 1080×1080 꽉 채우기 (상·하단 자르기 적용)
    if (img) {
      const t = clamp(S.trimTop, 0, 45) / 100, b = clamp(S.trimBottom, 0, 45) / 100;
      const sy = img.height * t;
      const srcH = Math.max(8, img.height * (1 - t - b));
      const sc = Math.max(W / img.width, H / srcH);
      const dw = img.width * sc, dh = srcH * sc;
      const blurPx = clamp(Number(S.simpleBlur) || 0, 0, 24);
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      if (blurPx > 0 && ctxFilterOK(g)) g.filter = `blur(${blurPx}px)`;
      g.drawImage(img, 0, sy, img.width, srcH, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.restore();
      const dim = clamp(Number(S.simpleDark) || 0, 0, 80) / 100;
      if (dim > 0) {
        g.fillStyle = `rgba(0,0,0,${dim})`;
        g.fillRect(0, 0, W, H);
      }
    }

    drawSimpleGradient(g);

    // 가운데 두 줄
    const k = clamp(S.simpleScale, 60, 160) / 100;
    const l1 = (S.simple.line1 || '').trim();
    const l2 = (S.simple.line2 || '').trim();
    const maxW = W - 170;
    const seg1 = [{ t: l1, a: false }], seg2 = [{ t: l2, a: false }];
    const s1 = l1 ? fitSize(g, [seg1], (s) => `900 ${s}px ${F_NOTO}`, maxW, Math.round(52 * k), Math.round(24 * k)) : 0;
    const s2 = l2 ? fitSize(g, [seg2], (s) => `600 ${s}px ${F_NOTO}`, maxW, Math.round(34 * k), Math.round(17 * k)) : 0;

    const ink1 = l1 ? inkBox(g, l1, s1, 900, F_NOTO) : null;
    const ink2 = l2 ? inkBox(g, l2, s2, 600, F_NOTO) : null;
    const gap12 = Math.round(14 * k);
    const blockH = (ink1 ? ink1.h : 0) + (ink1 && ink2 ? gap12 : 0) + (ink2 ? ink2.h : 0);

    const bottomPad = clamp(Number(S.simpleBottom) || 0, 0, 400);
    const blockTop = H - bottomPad - blockH;

    const opt = {
      strokeOn: !!S.simpleStroke,
      strokeWidth: clamp(Number(S.simpleStrokeW) || 0, 0, 10),
      shadowOn: !!S.simpleShadow,
      shadowBlur: 16,
      shadowY: 4,
      shadowOpacity: 0.6,
      color: '#ffffff'
    };

    if (l1) {
      g.font = `900 ${s1}px ${F_NOTO}`;
      const w = measure(g, seg1);
      drawLine(g, seg1, (W - w) / 2, blockTop - ink1.pad, s1, 900, F_NOTO, opt);
    }
    if (l2) {
      g.font = `600 ${s2}px ${F_NOTO}`;
      const w = measure(g, seg2);
      const y2 = blockTop + (ink1 ? ink1.h + gap12 : 0);
      drawLine(g, seg2, (W - w) / 2, y2 - ink2.pad, s2, 600, F_NOTO, opt);
    }

    // 오른쪽 아래 채널 태그 (문구 블록보다 살짝 위)
    const chans = (S.simple.chans || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
    if (chans.length) {
      const chSize = Math.round(clamp(Number(S.simpleChSize) || 25, 14, 40));
      const lh = chSize * 1.5;
      const chGap = clamp(Number(S.simpleChGap) || 0, 0, 300);
      const chBottom = blockH > 0 ? blockTop - chGap : H - bottomPad;
      let top = Math.max(28, chBottom - chans.length * lh);
      const right = W - 64;
      chans.forEach((line, i) => drawSimpleTag(g, line, right, top + i * lh + lh / 2, chSize));
    }
  }

  /* ───────── 렌더 ───────── */
  function render() {
    const g = canvas.getContext('2d');
    if (S.tab === 'outro' || S.tab === 'minimal' || S.tab === 'animal') {
      const OH = S.tab === 'animal' ? 1080 : outroHeight();
      if (canvas.height !== OH) canvas.height = OH;
      canvas.width = W;
      $('stage').style.aspectRatio = `1080 / ${OH}`;
      drawOutro(g, OH);
      $('stageEmpty').hidden = true;
      $('zipBtn').disabled = true;
      $('pngBtn').disabled = false;
      $('outroSizeTxt').textContent = `1080 × ${OH}`;
      $('dims').textContent = S.tab === 'animal'
        ? `1080 × ${OH} · 마무리(동물촌)`
        : S.tab === 'minimal'
          ? `1080 × ${OH} · 마무리(라일락)`
          : `1080 × ${OH} · 마무리(다크)`;
      if (!fontsReady) note('폰트 불러오는 중…');
      return;
    }
    if (S.tab === 'simple') {
      if (canvas.height !== H) canvas.height = H;
      if (canvas.width !== W) canvas.width = W;
      $('stage').style.aspectRatio = '1 / 1';
      drawSimpleCard(g, active >= 0 && items[active] ? items[active].img : null);
      $('stageEmpty').hidden = true;
      $('pngBtn').disabled = false;
      $('zipBtn').disabled = items.length === 0;
      $('dims').textContent = '1080 × 1080 · 심플 엔딩';
      if (!fontsReady) note('폰트 불러오는 중…');
      return;
    }
    if (canvas.height !== H) canvas.height = H;
    if (canvas.width !== W) canvas.width = W;
    $('stage').style.aspectRatio = '1 / 1';
    $('dims').textContent = S.layout === 'bar' ? '1080 × 1080 · 하단 검정창' : '1080 × 1080';
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
    const outroTab = S.tab === 'outro' || S.tab === 'minimal' || S.tab === 'animal';
    const noPhotoOK = outroTab || S.tab === 'simple';   // ⑤는 사진 없이도 저장 가능
    if (!noPhotoOK && (active < 0 || !items[active])) { toast('먼저 사진을 넣어 주세요'); return null; }
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) { toast('저장 실패 — 다시 시도해 주세요'); return null; }
    const name = S.tab === 'animal' ? `ending-dongmulchon-${stamp()}.png`
      : S.tab === 'simple' ? `ending-simple-${stamp()}.png`
        : S.tab === 'minimal' ? `minimal-${stamp()}.png`
          : S.tab === 'outro' ? `outro-${stamp()}.png` : `card-${stamp()}.png`;
    download(blob, name);
    toast(`PNG 저장 · ${name}`);
    return { blob, name };
  }

  async function buildZipBlob(onProgress) {
    const zip = new JSZip();
    const drawOne = S.tab === 'simple' ? drawSimpleCard : drawCard;
    for (let i = 0; i < items.length; i++) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      drawOne(c.getContext('2d'), items[i].img);
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
    $('barPct').value = S.barPct;
    $('barPctVal').textContent = S.barPct + '%';
    if ($('glassPct')) {
      $('glassPct').value = S.glassPct;
      $('glassPctVal').textContent = S.glassPct + '%';
      $('glassBlur').value = S.glassBlur;
      $('glassBlurVal').textContent = S.glassBlur + 'px';
      $('animalAccent').value = S.animalAccent;
    }
    $('skewOn').checked = S.skewOn;
    $('barFadeOn').checked = S.barFadeOn;
    $('barGapOn').checked = S.barGapOn;

    $('title1').value = S.title1;
    $('title2').value = S.title2;
    $('sub').value = S.sub;
    $('hlWords').value = S.hlWords;
    $('comment').value = S.comment;

    const map = [['oBrand', 'brand'], ['oLabel', 'label'], ['oTitle1', 'title1'], ['oTitle2', 'title2'],
      ['oItem1', 'item1'], ['oItem2', 'item2'], ['oItem3', 'item3'],
      ['oCta1', 'cta1'], ['oCta2', 'cta2'], ['oCh1', 'ch1'], ['oCh2', 'ch2'], ['oCh3', 'ch3'], ['oFoot', 'foot']];
    for (const [id, key] of map) $(id).value = S.outro[key];

    // ⑤ 심플 엔딩
    $('simpleBlur').value = S.simpleBlur;
    $('simpleBlurVal').textContent = S.simpleBlur + 'px';
    $('simpleDark').value = S.simpleDark;
    $('simpleDarkVal').textContent = S.simpleDark + '%';
    $('simpleGradPct').value = S.simpleGradPct;
    $('simpleGradPctVal').textContent = S.simpleGradPct + '%';
    $('simpleGradDark').value = S.simpleGradDark;
    $('simpleGradDarkVal').textContent = S.simpleGradDark + '%';
    $('simpleScale').value = S.simpleScale;
    $('simpleScaleVal').textContent = S.simpleScale + '%';
    $('simpleBottom').value = S.simpleBottom;
    $('simpleBottomVal').textContent = S.simpleBottom + 'px';
    $('simpleStrokeW').value = S.simpleStrokeW;
    $('simpleStrokeVal').textContent = S.simpleStrokeW + 'px';
    $('simpleChSize').value = S.simpleChSize;
    $('simpleChSizeVal').textContent = S.simpleChSize + 'px';
    $('simpleChGap').value = S.simpleChGap;
    $('simpleChGapVal').textContent = S.simpleChGap + 'px';
    $('sTrimTop').value = S.trimTop;
    $('sTrimTopVal').textContent = S.trimTop + '%';
    $('sTrimBottom').value = S.trimBottom;
    $('sTrimBottomVal').textContent = S.trimBottom + '%';
    $('sLine1').value = S.simple.line1;
    $('sLine2').value = S.simple.line2;
    $('sChans').value = S.simple.chans;
    $('simpleGradOn').checked = !!S.simpleGradOn;
    $('simpleStroke').checked = !!S.simpleStroke;
    $('simpleShadow').checked = !!S.simpleShadow;

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
    applyOutroUI();
    applyLayoutUI();
    applySimpleUI();
    applyAccentUI();
  }

  /* ⑤ 심플 엔딩 — 토글에 따라 보이는 컨트롤 */
  function applySimpleUI() {
    if (!$('simpleGradCtl')) return;
    $('simpleGradCtl').hidden = !S.simpleGradOn;
    $('simpleStrokeW').hidden = !S.simpleStroke;
    $('simpleStrokeVal').hidden = !S.simpleStroke;
  }

  /* 아웃트로 탭(마무리 다크 / 라일락 / 동물촌)에 따라 보이는 컨트롤을 바꾼다 */
  function applyOutroUI() {
    const style = S.tab === 'minimal' ? 'minimal' : S.tab === 'animal' ? 'animal' : 'summary';
    const t = $('outroTitleTxt');
    if (t) t.textContent = style === 'animal' ? '마무리(동물촌)'
      : style === 'minimal' ? '마무리(라일락)' : '마무리(다크·요약)';
    document.querySelectorAll('[data-when-ostyle]').forEach(el => {
      el.hidden = el.dataset.whenOstyle !== style;
    });
    document.querySelectorAll('[data-hide-on]').forEach(el => {
      el.hidden = el.dataset.hideOn === style;
    });
  }

  /* 레이아웃(블러/하단 검정창)에 따라 보이는 컨트롤을 바꾼다 */
  function applyLayoutUI() {
    const bar = S.layout === 'bar';
    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.classList.toggle('on', b.dataset.layout === S.layout));
    document.querySelectorAll('[data-when-layout]').forEach(el => {
      el.hidden = el.dataset.whenLayout !== S.layout;
    });
    document.querySelectorAll('[data-when-fade]').forEach(el => {
      el.hidden = (el.dataset.whenFade === 'off') === !!S.barFadeOn;
    });
    const cmt = document.querySelector('#textSeg button[data-text="comment"]');
    if (cmt) cmt.hidden = bar;
    if (bar && S.textMode === 'comment') {
      S.textMode = 'thumb';
      document.querySelectorAll('#textSeg button').forEach(b =>
        b.classList.toggle('on', b.dataset.text === S.textMode));
      document.querySelectorAll('[data-when]').forEach(el => { el.hidden = el.dataset.when !== S.textMode; });
    }
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
    bindRange('barPct', 'barPct', v => v + '%');
    bindRange('glassPct', 'glassPct', v => v + '%');
    bindRange('glassBlur', 'glassBlur', v => v + 'px');

    if ($('animalAccent')) {
      $('animalAccent').addEventListener('input', e => {
        S.animalAccent = e.target.value.toUpperCase();
        save(); render();
      });
    }

    $('skewOn').addEventListener('change', e => { S.skewOn = e.target.checked; save(); render(); });
    $('barGapOn').addEventListener('change', e => { S.barGapOn = e.target.checked; save(); render(); });
    $('barFadeOn').addEventListener('change', e => {
      S.barFadeOn = e.target.checked;
      document.querySelectorAll('[data-when-fade]').forEach(el => {
        el.hidden = (el.dataset.whenFade === 'off') === !!S.barFadeOn;
      });
      save(); render();
    });

    /* ⑤ 심플 엔딩 */
    bindRange('simpleBlur', 'simpleBlur', v => v + 'px');
    bindRange('simpleDark', 'simpleDark', v => v + '%');
    bindRange('simpleGradPct', 'simpleGradPct', v => v + '%');
    bindRange('simpleGradDark', 'simpleGradDark', v => v + '%');
    bindRange('simpleScale', 'simpleScale', v => v + '%');
    bindRange('simpleBottom', 'simpleBottom', v => v + 'px');
    bindRange('simpleStrokeW', 'simpleStrokeW', v => v + 'px');
    bindRange('simpleChSize', 'simpleChSize', v => v + 'px');
    bindRange('simpleChGap', 'simpleChGap', v => v + 'px');
    // 사진 자르기는 ① 카드와 같은 값(같은 사진 위치)을 함께 쓴다
    [['sTrimTop', 'trimTop'], ['sTrimBottom', 'trimBottom']].forEach(([id, key]) => {
      $(id).addEventListener('input', () => {
        S[key] = Number($(id).value);
        $(id + 'Val').textContent = S[key] + '%';
        $(key).value = S[key];
        $(key + 'Val').textContent = S[key] + '%';
        save(); render();
      });
    });
    $('sLine1').addEventListener('input', e => { S.simple.line1 = e.target.value; save(); render(); });
    $('sLine2').addEventListener('input', e => { S.simple.line2 = e.target.value; save(); render(); });
    $('sChans').addEventListener('input', e => { S.simple.chans = e.target.value; save(); render(); });
    $('simpleGradOn').addEventListener('change', e => { S.simpleGradOn = e.target.checked; applySimpleUI(); save(); render(); });
    $('simpleStroke').addEventListener('change', e => { S.simpleStroke = e.target.checked; applySimpleUI(); save(); render(); });
    $('simpleShadow').addEventListener('change', e => { S.simpleShadow = e.target.checked; save(); render(); });

    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.addEventListener('click', () => {
        S.layout = b.dataset.layout;
        applyLayoutUI();
        save(); render();
        note(S.layout === 'bar'
          ? '하단 검정창 — 사진 위쪽 + 가운데 기울임 두 줄'
          : '사진을 넣으면 바로 1:1 블러 카드가 만들어집니다.');
      }));

    $('strokeOn').addEventListener('change', e => { S.strokeOn = e.target.checked; save(); render(); });
    $('shadowOn').addEventListener('change', e => { S.shadowOn = e.target.checked; save(); render(); });

    ['title1', 'title2', 'sub', 'hlWords', 'comment'].forEach(id => bindText(id, id, false));
    [['oBrand', 'brand'], ['oLabel', 'label'], ['oTitle1', 'title1'], ['oTitle2', 'title2'],
      ['oItem1', 'item1'], ['oItem2', 'item2'], ['oItem3', 'item3'],
      ['oCta1', 'cta1'], ['oCta2', 'cta2'], ['oCh1', 'ch1'], ['oCh2', 'ch2'], ['oCh3', 'ch3'], ['oFoot', 'foot']
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
        $('panelSimple').hidden = S.tab !== 'simple';
        $('panelOutro').hidden = S.tab === 'card' || S.tab === 'simple';
        applyOutroUI();
        applySimpleUI();
        renderThumbs();
        render();
        note(S.tab === 'simple'
          ? '심플 엔딩 — 사진 위 가운데 두 줄 + 오른쪽 아래 채널 태그.'
          : S.tab === 'animal'
          ? '마무리(동물촌) — 꽃밭 마을 배경 위 반투명 크림 카드. 텍스트만 바꿔 PNG 저장.'
          : S.tab === 'minimal'
            ? '마무리(라일락) — 브랜드 · 마무리 문구 · 채널 3줄만 가운데 정렬로.'
            : S.tab === 'outro'
              ? '마무리(다크·요약) — 헤더 · 01·02·03 요약 · END 배지.'
              : '사진을 넣으면 바로 1:1 카드가 만들어집니다.');
        toEndAnchor();
      }));

    $('pickBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
    $('pickBtnS').addEventListener('click', () => $('fileInputS').click());
    $('fileInputS').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });

    const stage = $('stage');
    stage.addEventListener('click', () => {
      if (items.length) return;
      if (S.tab === 'card') $('fileInput').click();
      else if (S.tab === 'simple') $('fileInputS').click();
    });
    ['dragenter', 'dragover'].forEach(ev =>
      stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      stage.addEventListener(ev, e => { e.preventDefault(); stage.classList.remove('drag'); }));
    stage.addEventListener('drop', e => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        if (S.tab !== 'card' && S.tab !== 'simple') switchTab('card');
        addFiles(e.dataTransfer.files);
      }
    });
    document.addEventListener('paste', e => {
      if (!e.clipboardData) return;
      const files = Array.from(e.clipboardData.files || []);
      if (files.length) {
        if (S.tab !== 'card' && S.tab !== 'simple') switchTab('card');
        addFiles(files);
      }
    });

    $('clearBtn').addEventListener('click', clearAll);
    $('clearBtnS').addEventListener('click', clearAll);

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

    window.__cm = { S, items, render, buildZipBlob, savePNG, saveZip, addFiles, setAccent, switchTab, applyLayoutUI, applySimpleUI };

    // 사진 비우기(① 카드 · ⑤ 심플 엔딩 공통)
    function clearAll() {
      items.forEach(it => URL.revokeObjectURL(it.url));
      items.length = 0;
      active = -1;
      renderThumbs(); render();
      note(S.tab === 'simple'
        ? '사진 없이도 문구·채널 태그만으로 저장할 수 있어요.'
        : '사진을 넣으면 바로 1:1 블러 카드가 만들어집니다.');
    }

    // 탭 전환 시 컨트롤 상단으로 스크롤 (모바일)
    function toEndAnchor() {
      if (!window.matchMedia('(max-width: 980px)').matches) return;
      const el = S.tab === 'card' ? $('panelCard')
        : S.tab === 'simple' ? $('panelSimple') : $('panelOutro');
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
