const STAFF_TOP_Y = 0;
const LINE_GAP = 24;
const SPACE_GAP = LINE_GAP / 2;
const NOTE_BOTTOM_OFFSET = 3;
let STEP_DELTA = 1; // 段ずれ補正
let NOTE_SEQ_COUNTER = 1;

const TREBLE_STEPS = [
  'F6',  'E6', 'D6', 'C6', 'B5', 'A5', 'G5',
  'F5',  'E5', 'D5', 'C5', 'B4', 'A4', 'G4',
  'F4',  'E4', 'D4', 'C4', 'B3', 'A3', 'G3',
  'F3',  'E3', 'D3', 'C3', 'B2', 'A2', 'G2'
];
const INDEX_F5 = TREBLE_STEPS.indexOf('F5');

const BEATS_PER_MEASURE = 4; // 4/4拍子
const PX_PER_BEAT = 60;   // 1拍あたりの横ピクセル数
const LAYOUT_MODE = 'time'; // 'time' | 'visual'

// pitch → Y（描画）
function yFromPitchTreble(pitch) {
  const idx = TREBLE_STEPS.indexOf(pitch);
  if (idx < 0)
    return STAFF_TOP_Y + (INDEX_F5 + 4) * SPACE_GAP + NOTE_BOTTOM_OFFSET; // デフォB4
  const step = (idx - INDEX_F5) + STEP_DELTA;   // ← 補正を加えて描画
  return STAFF_TOP_Y + step * SPACE_GAP + NOTE_BOTTOM_OFFSET;
}
// Y → pitch（読み取り）
function pitchFromYTreble(y) {
  const stepMeasured = Math.round((y - STAFF_TOP_Y - NOTE_BOTTOM_OFFSET) / SPACE_GAP);
  const step = stepMeasured - STEP_DELTA;       // ← 補正を戻して本来の段へ
  const idx  = INDEX_F5 + step;
  const clampedIdx = Math.max(0, Math.min(TREBLE_STEPS.length - 1, idx));
  return TREBLE_STEPS[clampedIdx] || 'B4';
}

/* ユーティリティ */
/** staff の client座標Rect（スクロール補正不要） */
function getStaffRect(staffEl) {
  const rect = staffEl.getBoundingClientRect();
  return {
    left: rect.left,
    top:  rect.top,
    width: rect.width,
    height: rect.height
  };
}
/** ★ 左下アンカーで配置：x/y は staff 内座標（px） */
function placeNoteByLeftBottom(noteEl, xInStaff, yInStaff) {
  noteEl.style.left = `${xInStaff}px`;
  noteEl.style.top  = `${yInStaff}px`;
}
// 小数誤差を丸めてから比較（小数第2位）
function beatsToDurKey(beats) {
  const v = Math.round(beats * 100) / 100;
  for (const [key, ent] of Object.entries(DUR_LIB)) {
    const b = Math.round(ent.beats * 100) / 100;
    if (b === v) return key;
  }
  return null; // ぴったり一致しないときは null（高度な分割は後で）
}

/* 音価（長さ）管理 */
const RESIZE_STEP_PX = 24;
const NOTE_H_GAP = 12;
const INITIAL_INSERT_X = 24;
const DUR_ORDER = ['16', '8', '8h', '4', '4h', '2', '2h', '1'];
const REST_DUR_ORDER = ['16r','8r','4r','2r','1r'];
const DUR_LIB = {
  '1'   : { src:'images/onp_1.png', beats: 4 },   // 全音符
  '2'   : { src:'images/onp_2.png', beats: 2 },   // 二分音符
  '2h'  : { src:'images/onp_2h.png', beats: 3 },  // 二分付点
  '4'   : { src:'images/onp_4.png', beats: 1 },   // 四分音符
  '4h'  : { src:'images/onp_4h.png', beats: 1.5 },// 四分付点
  '8'   : { src:'images/onp_8.png', beats: 0.5 }, // 八分音符
  '8h'  : { src:'images/onp_8h.png', beats: 0.75 },  // 八分付点
  '16'  : { src:'images/onp_16.png', beats: 0.25 },  // 十六分音符
  '1r'  : { src:'images/kyh_1.png', beats: 4},    //全休符
  '2r'  : { src:'images/kyh_2.png', beats: 2},    //二分休符
  '4r'  : { src:'images/kyh_4.png', beats: 1},    //四分休符
  '8r'  : { src:'images/kyh_8.png', beats: 0.5},  //八分休符
  '16r'  : { src:'images/kyh_16.png', beats: 0.25}  //十六分休符
};
/** 音符に音価を適用（画像差し替え & dataset 更新） */
function applyDuration(noteEl, durKey) {
  const ent = DUR_LIB[durKey];
  if (!ent) {
    console.warn('未対応の音価キー:', durKey); return;}
  noteEl.dataset.dur = durKey;
  noteEl.src = ent.src;
}
/** 現在の音価キー（なければ四分） */
function getDuration(noteEl) {
  const k = noteEl.dataset.dur;
  return DUR_LIB[k] ? k : '4';
}
/** 拍数を取得 */
function getBeats(noteEl) {
  const k = getDuration(noteEl);
  return DUR_LIB[k].beats;
}
function getDurationOrder(el) {
  return el.classList.contains('rest-img') ? REST_DUR_ORDER : DUR_ORDER;
}
/** 音価インデックス（DUR_ORDER上） */
function getDurationIndex(noteEl) {
  const k = getDuration(noteEl);
  const order = getDurationOrder(noteEl);
  return order.indexOf(k);
}

// --- シャープ画像（必要に応じて dx,dy を微調整）---
const ACCIDENTAL_LIB = {
  sharp: { src: 'images/sharp.png', dx: -18, dy: -20 }
};
// 表示/非表示（位置追随もここで）
function setSharp(noteEl, enable) {
  if (!enable) {
    if (noteEl._accidentalEl) { noteEl._accidentalEl.remove(); noteEl._accidentalEl = null; }
    delete noteEl.dataset.accidental;
    return;
  }
  noteEl.dataset.accidental = 'sharp';
  let el = noteEl._accidentalEl;
  if (!el) {
    el = document.createElement('img');
    el.className = 'accidental-img';
    el.src = ACCIDENTAL_LIB.sharp.src;
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    noteEl.parentElement.appendChild(el);
    noteEl._accidentalEl = el;
  }
  const x = parseFloat(noteEl.style.left || '0') + ACCIDENTAL_LIB.sharp.dx;
  const y = parseFloat(noteEl.style.top  || '0') + ACCIDENTAL_LIB.sharp.dy;
  el.style.left = `${Math.round(x)}px`;
  el.style.top  = `${Math.round(y)}px`;
}
// E と B は ♯不可。それ以外は ♯可
function canBeSharp(pitch) {
  const letter = (pitch && pitch[0]) || '';
  return letter !== 'E' && letter !== 'B';
}

function nextNatural(pitch, dir /* -1:上, +1:下 */) {
  const i = TREBLE_STEPS.indexOf(pitch);
  if (i < 0) return pitch;
  const j = Math.max(0, Math.min(TREBLE_STEPS.length - 1, i + (dir < 0 ? -1 : +1)));
  return TREBLE_STEPS[j];
}

// シャープが付いているなら座標を更新（親が変わった時もOK）
function updateAccidentalPosition(el) {
  if (el && el.dataset && el.dataset.accidental === 'sharp') {
    setSharp(el, true); // 既存の setSharp が位置計算と親appendをやってくれる
  }
}

//休符
const REST_Y_IN_STAFF = 60;
const REST_OFFSET_STEPS = 2;
const REST_BOTTOM_OFFSET = 0;
function yForQuarterRest() {
  const delta = REST_OFFSET_STEPS * SPACE_GAP;
  return STAFF_TOP_Y + REST_Y_IN_STAFF + delta + REST_BOTTOM_OFFSET;
}
function insertQuarterRest(autoPlace = true, x = 24) {
  const staff = document.getElementById('staff');
  if (!staff) { console.error('staff が見つかりません'); return; }

  const img = document.createElement('img');
  img.className = 'rest-img';
  img.dataset.dur = '4r';
  img.alt = '休符 4r';
  img.src = DUR_LIB['4r'].src;

  if (typeof NOTE_SEQ_COUNTER === 'undefined') window.NOTE_SEQ_COUNTER = 1;
  img.dataset.seq = (NOTE_SEQ_COUNTER++);

  const y = yForQuarterRest();
  const xPlace = autoPlace ? getNextInsertX(staff) : x;
  placeNoteByLeftBottom(img, xPlace, y);
  staff.appendChild(img);
  // ★ 縦ドラッグは付けない。リサイズのみ付与
  // makeVerticalDrag(img); // ← 付けない
  makeResizeDrag(img);      // ← これだけ有効化
  // レイアウト反映
  if (img.complete) scheduleLayout(staff);
  else img.addEventListener('load', () => scheduleLayout(staff), { once: true });
}
// 休符ユーティリティ
function isRestEl(el) {
  return el && el.classList && el.classList.contains('rest-img');
}
function markRestSplit(el, on = true) {
  if (!el) return;
  if (on) el.dataset.splitRest = 'true';
  else delete el.dataset.splitRest;
}
// 拍→キー（休符／音符で別）
function beatsToKeyFromOrder(order, beats) {
  const v = Math.round(beats * 100) / 100;
  for (const k of order) {
    const b = Math.round(DUR_LIB[k].beats * 100) / 100;
    if (b === v) return k;
  }
  return null;
}
function nearestKeyFromOrder(order, beats) {
  let bestKey = order[0], bestDiff = Infinity;
  for (const k of order) {
    const diff = Math.abs(DUR_LIB[k].beats - beats);
    if (diff < bestDiff) { bestDiff = diff; bestKey = k; }
  }
  return bestKey;
}
function beatsToNoteDurKey(beats){ return beatsToKeyFromOrder(DUR_ORDER, beats); }
function beatsToRestDurKey(beats){ return beatsToKeyFromOrder(REST_DUR_ORDER, beats); }
function nearestNoteDurKey(beats){ return nearestKeyFromOrder(DUR_ORDER, beats); }
function nearestRestDurKey(beats){ return nearestKeyFromOrder(REST_DUR_ORDER, beats); }

document.addEventListener('DOMContentLoaded', () => {
  const btnRest = document.getElementById('btnInsertkyh');
  if (btnRest) btnRest.addEventListener('click', () => insertQuarterRest(true));
});

//tie
function drawTieBetween(staffEl,x1,y1,x2,y2,up=true) {
  const dx = Math.max(0,x2-x1);
  if(dx <= 6) return; 

  const img = document.createElement('img');
  img.className = 'tie-img';
  img.src = 'images/tie.png';
  img.style.left = `${x1}px`;
  img.style.width = `${dx}px`;

  const BASE_H = 16;
  const LIFT = up ? 10 : -10;
  img.style.height = `${BASE_H}px`;
  img.style.top = `${Math.round(((y1 + y2) / 2) + LIFT - BASE_H/2)}px`;

  staffEl.appendChild(img);
}
function clearTies(staffEl) {
  const svg = staffEl.querySelector('svg.tie-overlay');
  if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild);
  staffEl.querySelectorAll('img.tie-img').forEach(el => el.remove());
}
// 同じ tieGroupID を持つ音符を配列で返す（グループ外なら単独で返す）
function getTieGroupEls(noteEl) {
  const gid = noteEl.dataset.tieGroupID;
  if (!gid) return [noteEl];
  const staff = noteEl.parentElement;
  return Array.from(staff.querySelectorAll('.note-img')).filter(el => el.dataset.tieGroupID === gid);
}
// ── タイ＆ロックのユーティリティ ──
let TIE_GROUP_COUNTER = 1;
function markLocked(noteEl, locked = true) {
  if (locked) {
    noteEl.dataset.locked = 'true';
    noteEl.classList.add('locked');
  } else {
    delete noteEl.dataset.locked;
    noteEl.classList.remove('locked');
  }
}
function isLocked(noteEl) { return noteEl.dataset.locked === 'true'; }

function assignTieGroup(firstEl, secondEl) {
  const gid = firstEl.dataset.tieGroupID || `tg${TIE_GROUP_COUNTER++}`;
  firstEl.dataset.tieGroupID = gid; firstEl.dataset.tieIndex = '0';
  if(secondEl) { secondEl.dataset.tieGroupID = gid; secondEl.dataset.tieIndex = '1'; }
}

function findTieTail(firstEl) {
  const gid = firstEl.dataset.tieGroupID;
  if (!gid) return null;
  const staff = firstEl.parentElement;
  const tail = Array.from(staff.querySelectorAll('.note-img')).find(el => el.dataset.tieGroupID === gid && el.dataset.tieIndex === '1') || null;
  return tail;
}

// 浮動小数の誤差に強い「小節境界」判定
function isMeasureBoundary(beats) {
  const r = Math.round(beats * 1000) / 1000; // 小数第3位で丸め
  const mod = Math.round((r % BEATS_PER_MEASURE) * 1000) / 1000;
  const eps = 1e-3;
  return (mod < eps) || (Math.abs(BEATS_PER_MEASURE - mod) < eps);
}
// === アンカー関数（基準点計算） ===========================
// 左端アンカー：音符の staff 内 left と、少し上に持ち上げた y を返す
function tieAnchorFromNoteLeftEdge(noteEl, staffRect) {
  const xLeft   = leftInStaff(noteEl, staffRect);
  const yBottom = parseFloat(noteEl.style.top || '0');
  const Y_OFFSET = 18; // タイを少し上に描く量（既存値に合わせる）
  const y = yBottom - Y_OFFSET;
  return { x: xLeft, y };
}
// 右端アンカー：左端 + 画像幅（clientRect）で右端 x を算出
function tieAnchorFromNoteRightEdge(noteEl, staffRect) {
  const xLeft   = leftInStaff(noteEl, staffRect);
  const rect    = noteEl.getBoundingClientRect();
  const xRight  = xLeft + rect.width;
  const yBottom = parseFloat(noteEl.style.top || '0');
  const Y_OFFSET = 18;
  const y = yBottom - Y_OFFSET;
  return { x: xRight, y };
}
//モードに応じてスケジューラを呼ぶ
function scheduleLayout(staffEl) {
  if (LAYOUT_MODE === 'time') scheduleTimeLayout();
  else scheduleReflow(staffEl);
}
/* 右端＋余白で次のXを決める */
/** staff内で一番右の音符の右端（client→staff基準）を返す。なければ null */
function getRightmostNoteRight(staffEl) {
  const staffRect = getStaffRect(staffEl);
  const notes = Array.from(staffEl.querySelectorAll('.note-img'));
  if (notes.length === 0) return null;

  let maxRight = -Infinity;
  for (const n of notes) {
    const r = n.getBoundingClientRect();
    const rightInStaff = r.right - staffRect.left; // client座標→staff基準
    if (rightInStaff > maxRight) maxRight = rightInStaff;
  }
  return maxRight;
}
/** 次の挿入X（最後の右端＋余白）。音符がなければ初期値 */
function getNextInsertX(staffEl) {
  const rightmost = getRightmostNoteRight(staffEl);
  if (rightmost == null) return INITIAL_INSERT_X;
  return rightmost + NOTE_H_GAP;
}
/* 音符のリフロー配置（左から順に詰める） */
function reflowNotes(staffEl) {
  if (!staffEl) return;
  const staffRect = getStaffRect(staffEl);
  // 現在の left（style.left または rect から推定）と実幅を収集
  const items = Array.from(staffEl.querySelectorAll('.note-img'))
    .map(el => {
      const rect = el.getBoundingClientRect();
      const left = leftInStaff(el, staffRect);
      const width = rect.width; // 画像の実寸幅
      return { el, left, width };
    })
    .sort((a, b) => a.left - b.left); // 現在の並び順を維持
  // 走査しながら「次に置ける最小X」を更新
  let cursorX = INITIAL_INSERT_X;
  for (const it of items) {
    const targetLeft = cursorX; // この音符の目標X位置
    it.el.style.left = `${Math.round(targetLeft)}px`;
    updateAccidentalPosition(it.el);  //#の座標追尾
    // 次の最小X（この音符の右端＋余白）
    cursorX = targetLeft + it.width + NOTE_H_GAP;
    // 音名ラベルを使っている場合は追随
    if (it.el._labelEl) {
      it.el._labelEl.style.left = `${Math.round(targetLeft)}px`;
      it.el._labelEl.style.top  = it.el.style.top;
    }
  }
}
/* rAFで一度だけ reflowNotes を呼ぶ（連続呼び出しのまとめ役）*/
function scheduleReflow(staffEl) {
  if (!staffEl) return;
  if (staffEl._reflowScheduled) return;
  staffEl._reflowScheduled = true;
  requestAnimationFrame(() => {
    staffEl._reflowScheduled = false;
    reflowNotes(staffEl);
  });
}
/* 小節線配置 */
function xFromBeat(beats) { return Math.round(beats * PX_PER_BEAT); }
function placeMeasureLineAt(staffEl, xPx) {
  const line = document.createElement('div');
  line.className = 'measure-line';
  line.style.left = `${xPx}px`;
  staffEl.appendChild(line);
}
function splitBeatsAtBoundary(startBeat, beats) {
  const nextBoundary = Math.floor(startBeat / BEATS_PER_MEASURE) * BEATS_PER_MEASURE + BEATS_PER_MEASURE;
  const endBeat = startBeat + beats;
  if (endBeat <= nextBoundary) return { firstBeats: beats, restBeats: 0 };
  const firstBeats = nextBoundary - startBeat;
  const restBeats = beats - firstBeats;
  return { firstBeats, restBeats };
}

function nearestDurKey(beats) {
  let bestKey = '4';
  let bestDiff = Infinity;
  for(const [key, ent] of Object.entries(DUR_LIB)) {
    const diff = Math.abs(ent.beats - beats);
    if (diff < bestDiff) { bestDiff = diff; bestKey = key; }
  } return bestKey;
}

function recomputeTimeLayoutAndBars() {
  // 0) 既存の measure/tie を全段からクリア
  clearAllMeasureLines();
  document.querySelectorAll('.staff img.tie-img').forEach(el => el.remove());
  // 1) 譜全体の音符を収集（全段から）
  const allNotes = Array.from(document.querySelectorAll('.staff .note-img, .staff .rest-img'));
  // 2) 時間順にソート（dataset.seq があれば優先）
  function sortKey(el) {
    const s = parseInt(el.dataset.seq || '0', 10);
    if (s > 0) return { k: s, t: 0 };
    const sr = getStaffRect(el.parentElement);
    return { k: Math.round(leftInStaff(el, sr)), t: 1 };
  }
  const notes = allNotes
    .map(el => ({ el, key: sortKey(el) }))
    .sort((a,b) => (a.key.k - b.key.k) || (a.key.t - b.key.t))
    .map(x => x.el);
  // 3) 左端(0拍)の小節線（段0）をとりあえず配置
  placeMeasureLineAtRow(ensureStaffRow(0), 0);

// ── 4) 左から順に時間配置 ──
let accBeats = 0;
for (let i = 0; i < notes.length; i++) {
  const first = notes[i];

  // ★ タイ後半はスキップ（音符のみ意味あり／休符は tie を使わない）
  if (first.dataset.tieIndex === '1') continue;

  const rest = isRestEl(first);
  const tailNote = rest ? null : findTieTail(first);
  const totalBeats = rest
    ? getBeats(first)
    : (getBeats(first) + (tailNote ? getBeats(tailNote) : 0));

  const span = rowSpanBeats();
  const rowIdxStart = Math.floor(accBeats / span);
  const xStart = (accBeats % span) * PX_PER_BEAT;
  const rowElStart = ensureStaffRow(rowIdxStart);

  if (first.parentElement !== rowElStart) rowElStart.appendChild(first);
  first.style.left = `${Math.round(xStart)}px`;
  updateAccidentalPosition(first);

  if (isMeasureBoundary(accBeats)) placeMeasureLineAtRow(rowElStart, Math.round(xStart));

  const nextBoundary = Math.floor(accBeats / BEATS_PER_MEASURE) * BEATS_PER_MEASURE + BEATS_PER_MEASURE;
  const endBeat = accBeats + totalBeats;

  if (endBeat > nextBoundary) {
    // ── 小節をまたぐ ──
    const firstBeats = nextBoundary - accBeats;
    const restBeats  = totalBeats - firstBeats;

    if (rest) {
      // ===== 休符：フラグ付与＆分割のみ（タイ禁止） =====
      markRestSplit(first, true);

      const k1 = beatsToRestDurKey(firstBeats) || nearestRestDurKey(firstBeats);
      applyDuration(first, k1);

      // 後半休符を新規作成
      const tailEl = document.createElement('img');
      tailEl.className = 'rest-img';
      tailEl.dataset.dur = '4r';
      tailEl.alt = '休符';
      tailEl.src = DUR_LIB['4r'].src;

      const k2 = beatsToRestDurKey(restBeats) || nearestRestDurKey(restBeats);
      applyDuration(tailEl, k2);

      const y = yForQuarterRest();
      const rowIdxTail = Math.floor(nextBoundary / span);
      const xTail = (nextBoundary % span) * PX_PER_BEAT;
      const rowElTail = ensureStaffRow(rowIdxTail);
      placeNoteByLeftBottom(tailEl, Math.round(xTail), y);
      rowElTail.appendChild(tailEl);
      updateAccidentalPosition(tailEl);

      // 休符は横リサイズのみ
      makeResizeDrag(tailEl);

      placeMeasureLineAtRow(rowElTail, Math.round(xTail));

      // ★ 休符は tie 属性を絶対に付けない
      delete first.dataset.tieGroupID;
      delete first.dataset.tieIndex;

      accBeats = endBeat;
    } else {
      // ===== 音符：従来どおり 分割＋タイ =====
      const k1 = beatsToNoteDurKey(firstBeats) || nearestNoteDurKey(firstBeats);
      applyDuration(first, k1);

      let tailEl = tailNote;
      if (!tailEl) {
        tailEl = first.cloneNode(true);
        first.after(tailEl);
        makeVerticalDrag(tailEl);
        makeResizeDrag(tailEl);
      }
      const k2 = beatsToNoteDurKey(restBeats) || nearestNoteDurKey(restBeats);
      applyDuration(tailEl, k2);

      assignTieGroup(first, tailEl);
      markLocked(first, false);
      markLocked(tailEl, false);

      const rowIdxTail = Math.floor(nextBoundary / span);
      const xTail = (nextBoundary % span) * PX_PER_BEAT;
      const rowElTail = ensureStaffRow(rowIdxTail);
      if (tailEl.parentElement !== rowElTail) rowElTail.appendChild(tailEl);
      tailEl.style.left = `${Math.round(xTail)}px`;
      updateAccidentalPosition(tailEl);

      placeMeasureLineAtRow(rowElTail, Math.round(xTail));

      if (rowElStart === rowElTail) {
        const staffRect = getStaffRect(rowElStart);
        const a1 = tieAnchorFromNoteRightEdge(first, staffRect);
        const a2 = tieAnchorFromNoteLeftEdge(tailEl, staffRect);
        drawTieBetween(rowElStart, a1.x + 6, a1.y, a2.x - 6, a2.y, true);
      }

      accBeats = endBeat;
    }
  } else {
    // ── 小節内で完結 ──
    if (rest) {
      // 休符：フラグを掃除して音価だけ正規化（任意）
      markRestSplit(first, false);
      const k = beatsToRestDurKey(totalBeats) || getDuration(first);
      applyDuration(first, k);
      delete first.dataset.tieGroupID;
      delete first.dataset.tieIndex;
    } else {
      // 音符：従来の正規化
      const k = beatsToNoteDurKey(totalBeats) || getDuration(first);
      applyDuration(first, k);
      markLocked(first, false);
      if (tailNote) tailNote.remove();
      delete first.dataset.tieGroupID;
      delete first.dataset.tieIndex;
    }

    accBeats = endBeat;

    if (isMeasureBoundary(accBeats)) {
      const rowIdxEnd = Math.floor(accBeats / span);
      const xEnd = (accBeats % span) * PX_PER_BEAT;
      placeMeasureLineAtRow(ensureStaffRow(rowIdxEnd), Math.round(xEnd));
    }
  }
}
}

function scheduleTimeLayout() {
  const staff = document.getElementById('score');
  if (!staff) return;
  if(staff.querySelector('.note-img.resizing')) return; 
  if (staff._timeLayoutScheduled) return;
  staff._timeLayoutScheduled = true;
  requestAnimationFrame(() => {
    staff._timeLayoutScheduled = false;
    recomputeTimeLayoutAndBars();
  });
}

/* ドラッグ処理 */
/** リサイズ開始条件：Shift押下 または 画像右側（幅の60%以降） */
function shouldResize(noteEl, e) {
  if (e.shiftKey) return true;
  const rect = noteEl.getBoundingClientRect();
  const xRel = e.clientX - rect.left;
  return xRel >= rect.width * 0.6;
}
/** 縦方向のみドラッグ */
function makeVerticalDrag(noteEl) {
  noteEl.addEventListener('pointerdown', (e) => {
    if (shouldResize(noteEl, e)) return;      // リサイズ操作は別処理
    e.preventDefault();
    noteEl.setPointerCapture(e.pointerId);

    const staff = noteEl.parentElement;
    const staffRect = staff.getBoundingClientRect();
    // 左下アンカー維持：現在のtopをそのまま基準に使う
    const baseClientY = e.clientY;
    const startTop = parseFloat(noteEl.style.top || '0');
    // タイで結ばれた仲間は同じYに追随させる（音程は同一想定）
    const groupEls = getTieGroupEls(noteEl);
    // pointerdown の直後で初期化してください
    let dragAcc = 0;
    let lastClientY = e.clientY;

    function onMove(ev) {
      const dy = ev.clientY - lastClientY;
      lastClientY = ev.clientY;
      dragAcc += dy;
      // 1段ぶんのドラッグが溜まったら消費して1ステップ進める
      if (Math.abs(dragAcc) < SPACE_GAP) return;
    
      const steps = (dragAcc > 0 ? +1 : -1); // +1:下(低く), -1:上(高く)
      dragAcc = 0; // しきい値を消費
      // まとめて大きく動いた場合でも 1 ステップずつ処理
      const repeat = 1; // 今回は1ステップずつに限定。必要なら Math.abs(steps) に変更
      for (let k = 0; k < repeat; k++) {
        const dir = steps; // -1:上 / +1:下
        let pitch = noteEl.dataset.pitch || pitchFromYTreble(parseFloat(noteEl.style.top || '0'));
        let hasSharp = noteEl.dataset.accidental === 'sharp';
      
        if (dir < 0) {
          // --- 上方向（高く） ---
          if (!hasSharp && canBeSharp(pitch)) {
            // ① 今が ♯なし かつ ♯可 → ♯を付ける（位置は動かさない）
            setSharp(noteEl, true);
          } else {
            // ② それ以外 → ♯を外して 1 段上の自然音へ
            setSharp(noteEl, false);
            const next = nextNatural(pitch, -1); // 上へ
            noteEl.dataset.pitch = next;
            noteEl.style.top = `${yFromPitchTreble(next)}px`;
          }
        } else {
          // --- 下方向（低く） ---
          if (hasSharp) {
            // ① 今が ♯付き → ♯を外す（位置は動かさない）
            setSharp(noteEl, false);
          } else {
            // ② 今が ♯なし → 1 段下の自然音へ
            const next = nextNatural(pitch, +1); // 下へ
            noteEl.dataset.pitch = next;
            noteEl.style.top = `${yFromPitchTreble(next)}px`;
          
            // さらに、その自然音が ♯可なら「前の♯」に相当するので即座に ♯ を付ける
            // 例：A → (下) → G に移動後、G♯ を挟みたいのでここで sharp をオン
            if (canBeSharp(next)) setSharp(noteEl, true);
          }
        }
      
        // タイ仲間がいれば追随
        for (const peer of groupEls) {
          if (peer !== noteEl) {
            if (peer.dataset.pitch !== noteEl.dataset.pitch) {
              peer.dataset.pitch = noteEl.dataset.pitch;
              peer.style.top = noteEl.style.top;
            }
            // シャープ状態も同期したいなら以下を有効化
            if (noteEl.dataset.accidental === 'sharp') setSharp(peer, true);
            else setSharp(peer, false);
          }
        }
      
        // 位置が変わった場合は ♯画像の座標も追随
        if (noteEl.dataset.accidental === 'sharp') setSharp(noteEl, true);
      }
    }

    function onUp() {
      noteEl.releasePointerCapture(e.pointerId);
      noteEl.removeEventListener('pointermove', onMove);
      noteEl.removeEventListener('pointerup', onUp);
      // レイアウト更新（小節線・タイ等）
      scheduleLayout(noteEl.parentElement);
    }

    noteEl.addEventListener('pointermove', onMove);
    noteEl.addEventListener('pointerup', onUp);
  });
  // ブラウザのデフォルト画像ドラッグを無効化
  noteEl.ondragstart = () => false;
}

/** 横ドラッグで音価を段階変更*/
function makeResizeDrag(noteEl) {
  noteEl.addEventListener('pointerdown', (e) => {
    if(isLocked(noteEl)) return;        // ロック中は無効
    if (!shouldResize(noteEl, e)) return; // 右側 or Shift でのみ開始

    e.preventDefault();
    noteEl.setPointerCapture(e.pointerId);
    noteEl.classList.add('resizing');
    // ★ 並び順をここで決める（音符 or 休符）
    const order = getDurationOrder(noteEl);

    let baseClientX = e.clientX;
    let curIdx = getDurationIndex(noteEl);
    if (curIdx < 0) curIdx = order.indexOf(noteEl.classList.contains('rest-img') ? '4r' : '4');

    function onMove(ev) {
      const dx = ev.clientX - baseClientX;
      const steps = Math.floor(dx / RESIZE_STEP_PX);
      if (steps !== 0) {
        let newIdx = curIdx + steps;
        newIdx = Math.max(0, Math.min(order.length - 1, newIdx));
        if (newIdx !== curIdx) {
          curIdx = newIdx;
          const newKey = order[curIdx];
          applyDuration(noteEl, newKey);
          updateAccidentalPosition(noteEl);
          baseClientX += steps * RESIZE_STEP_PX; // しきい値消化
        }
      }
    }

    function onUp() {
      noteEl.releasePointerCapture(e.pointerId);
      noteEl.removeEventListener('pointermove', onMove);
      noteEl.removeEventListener('pointerup', onUp);
      noteEl.classList.remove('resizing');
      scheduleLayout(noteEl.parentElement); // 時間レイアウト更新
    }

    noteEl.addEventListener('pointermove', onMove);
    noteEl.addEventListener('pointerup', onUp);
  });
}

//挿入系 
function insertNoteAtPitch(pitch, durKey = '4', autoPlace = true, x = 24) {
  const staff = document.getElementById('staff');
  if (!staff) { console.error('staff が見つかりません'); return; }

  const img = document.createElement('img');
  img.className = 'note-img';
  img.alt = `音符 ${pitch} ${durKey}`;
  img.dataset.dur = durKey;
  const ent = DUR_LIB[durKey] ? DUR_LIB[durKey] : DUR_LIB['4'];
  img.src = ent.src;
  img.dataset.seq = (NOTE_SEQ_COUNTER++);

  const y = yFromPitchTreble(pitch);
  const xPlace = autoPlace ? getNextInsertX(staff) : x;

  placeNoteByLeftBottom(img, xPlace, y);
  staff.appendChild(img);
  makeVerticalDrag(img);
  makeResizeDrag(img);
  // ★ 幅確定タイミングでリフロー
  if (img.complete) {
    scheduleLayout(staff);
  } else {
    img.addEventListener('load', () => {
      scheduleLayout(staff);
    }, { once: true });
  }
}
//音符挿入
function insertQuarterNoteAtF() {
  insertNoteAtPitch('F4', '4', true);
}
/* 初期化 */
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnInsertonp');
  if (btn) btn.addEventListener('click', insertQuarterNoteAtF);
});

function leftInStaff(el, staffRect) {
  const s = el.style.left;
  if (s && !isNaN(parseFloat(s))) return parseFloat(s);
  const r = el.getBoundingClientRect();
  return r.left - staffRect.left; // styleが空ならrect差分で代用
}

// ---- 段折り返し設定 ----
const MEASURES_PER_ROW = 3; // 「3小節で折り返し」

function rowSpanBeats() {
  return MEASURES_PER_ROW * BEATS_PER_MEASURE; // 1段あたりの総拍
}
function rowWidthPx() {
  return rowSpanBeats() * PX_PER_BEAT; // 段幅(px) = 小節×拍×px/拍
}
// score / row 取得・生成
function getScoreEl() { return document.getElementById('score'); }
// 指定indexの段(.staff)を返す。なければ新規作成（五線5本を追加）
function ensureStaffRow(rowIndex) {
  const score = getScoreEl();
  if (!score) return null;

  let rows = score.querySelectorAll('.staff');
  while (rows.length <= rowIndex) {
    const row = document.createElement('div');
    row.className = 'staff';
    row.style.width = `${rowWidthPx()}px`;     // 段幅を自動設定
    row.style.height = `96px`;                // 既存CSSと一致（必要なら取得して代入でもOK）
    // 5本の譜線を追加（既存のDOMを踏襲）
    for (let i = 0; i < 5; i++) {
      const line = document.createElement('div');
      line.className = 'staff-line';
      row.appendChild(line);
    }
    score.appendChild(row);
    rows = score.querySelectorAll('.staff');
  }
  // 既存の #staff（初段）はこの ensure で rows[0] として扱える
  return rows[rowIndex];
}

function clearAllMeasureLines() {
  document.querySelectorAll('.staff .measure-line').forEach(el => el.remove());
}

function placeMeasureLineAtRow(rowEl, xPx) {
  const line = document.createElement('div');
  line.className = 'measure-line';
  line.style.left = `${Math.round(xPx)}px`;
  rowEl.appendChild(line);
}

// === ▼ 再生：Tone.js を使った最小実装 ▼ ===

// 1) 音名ユーティリティ（♯付きに変換）
function noteNameFromEl(el) {
  const p = el.dataset.pitch || pitchFromYTreble(parseFloat(el.style.top || '0'));
  const sharp = el.dataset.accidental === 'sharp';
  if (!p) return 'A4';
  return sharp ? (p[0] + '#' + p.slice(1)) : p;
}

// 2) イベント列を収集（タイは合算／休符は無音イベント）
function collectPlayableEvents() {
  const els = Array.from(document.querySelectorAll('.staff .note-img, .staff .rest-img'));

  function sortKey(el) {
    const s = parseInt(el.dataset.seq || '0', 10);
    if (s > 0) return { k: s, t: 0 };
    const sr = getStaffRect(el.parentElement);
    return { k: Math.round(leftInStaff(el, sr)), t: 1 };
  }

  const sorted = els.map(el => ({ el, key: sortKey(el) }))
                    .sort((a,b) => (a.key.k - b.key.k) || (a.key.t - b.key.t))
                    .map(x => x.el);

  const events = [];
  let accBeats = 0;

  for (const el of sorted) {
    if (el.dataset.tieIndex === '1') continue; // タイ後半はスキップ
    const isRest = el.classList.contains('rest-img');

    let beats = getBeats(el);
    if (!isRest) {
      const tail = findTieTail(el);
      if (tail) beats += getBeats(tail);
    }

    events.push({
      startBeats: accBeats,
      beats,
      isRest,
      noteName: isRest ? null : noteNameFromEl(el),
      el
    });

    accBeats += beats;
  }
  return events;
}

// 3) Tone.js 再生エンジン
let _tone = { inited:false, synth:null, part:null };

async function ensureToneReady() {
  if (!_tone.inited) {
    // ユーザー操作後に呼ばれる前提（モバイルのオーディオ解禁）
    await Tone.start();
    _tone.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, release: 0.03 }
    }).toDestination();
    _tone.inited = true;
  }
}

async function playFromStart(bpm = 120) {
  await ensureToneReady();

  const events = collectPlayableEvents();
  if (events.length === 0) return;
  // 既存のパートを掃除
  if (_tone.part) { _tone.part.dispose(); _tone.part = null; }
  Tone.Transport.stop();
  Tone.Transport.cancel();
  Tone.Transport.bpm.value = bpm;
  // 拍→秒に換算して Part に渡す
  const items = events.map(ev => {
    const t = (60 / bpm) * ev.startBeats;   // 開始秒
    const d = (60 / bpm) * ev.beats;        // 長さ（秒）
    return [t, { isRest: ev.isRest, name: ev.noteName, durSec: d, el: ev.el }];
  });

  _tone.part = new Tone.Part((time, data) => {
    // 再生中の視覚フィードバック（任意）
    data.el.classList.add('playing');
    setTimeout(() => data.el.classList.remove('playing'),
               Math.max(50, data.durSec * 1000));

    if (!data.isRest && data.name) {
      _tone.synth.triggerAttackRelease(data.name, data.durSec, time);
    }
  }, items);

  _tone.part.start(0);
  Tone.Transport.start("+0.05"); // わずかに遅延開始で安定
}

function stopPlayback() {
  if (!_tone.inited) return;
  Tone.Transport.stop();
  Tone.Transport.cancel();
  if (_tone.part) { _tone.part.dispose(); _tone.part = null; }
}
// 4) ボタン配線（再生/停止トグル）
document.addEventListener('DOMContentLoaded', () => {
  const btnPlay = document.getElementById('btnPlay');
  const bpmInput = document.getElementById('bpm');

  if (btnPlay) {
    btnPlay.addEventListener('click', async () => {
      const bpmVal = parseInt(bpmInput?.value || '120', 10);
      if (Tone.Transport.state === 'started') {
        stopPlayback();
        btnPlay.textContent = '▶ 再生';
      } else {
        await playFromStart(bpmVal);
        btnPlay.textContent = '■ 停止';
      }
    });
  }
});


