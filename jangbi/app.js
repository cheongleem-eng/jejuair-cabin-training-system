/* ============================================================
   비상장비 TEST — app.js
   - data.js(JANGBI_DATA)의 빈칸 후보 중 무작위로 골라 사진 위에 입력칸을 띄움
   - 띄어쓰기/대소문자/일부 기호는 무시하고 채점
   ============================================================ */
(function () {
  'use strict';

  const DATA = window.JANGBI_DATA || [];
  const STORE_KEY = 'jangbi-test-v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  let state = {
    name: '', emp: '', level: 'A', chk: false,
    selected: [],       // 선택한 장비 id 목록 (화면 순서 유지)
    exam: null,         // [{ gid, images: [{ ii, picks: [blankIndex...] }] }]
    answers: {},        // key "g|i|b" -> 입력값
    page: 0,
    submitted: false,
    startedAt: null, finishedAt: null
  };

  /* ---------------- 공통 ---------------- */
  /* ---------------- 채점 (정답 폭 넓게) ----------------
     1) 띄어쓰기·대소문자·기호 무시
     2) 헷갈리는 모음 통일: ㅐ/ㅒ/ㅖ → ㅔ, ㅙ/ㅚ → ㅞ
     3) 영어 ↔ 한글 발음 표기 동일 취급 (Trigger = 트리거)
     4) 숫자: 3 = 셋 = 세 = 삼, 2개 = 두 개, 40초 = 사십초, 2~3분 = 2에서 3분 */
  const TRANSLIT = {
    activate: ['액티베이트', '액티베잇', '액티브에이트', '액티베이터'],
    off: ['오프', '옾'], test: ['테스트', '테스투'], pass: ['패스', '파스'], fail: ['페일', '페이루'],
    armed: ['암드', '아암드', '알므드', '아므드'], tx: ['티엑스'], rx: ['알엑스'],
    ped: ['피이디', '피디'], fak: ['팩', '에프에이케이'], upk: ['유피케이'], emk: ['이엠케이'],
    inop: ['이놉', '아이놉', '인옵', '이납'], seal: ['씰', '실'], galley: ['갤리', '갤러리'],
    bracket: ['브라켓', '브래킷', '브라킷', '브래캣', '브라켇', '브래켓'],
    trigger: ['트리거', '트리가', '트리그'], lever: ['레버', '레바', '리버'], pin: ['핀'],
    snap: ['스냅'], side: ['사이드'], overwing: ['오버윙'],
    lanyard: ['랜야드', '래니어드', '랜이어드', '래냐드', '랜야아드', '레니어드', '랜니어드'],
    inflation: ['인플레이션'], handle: ['핸들'],
    survival: ['서바이벌', '써바이벌', '서바이블', '서바이바루'], kit: ['키트', '킷', '킽'],
    canopy: ['캐노피', '카노피', '캐너피', '카노삐'], escape: ['이스케이프', '에스케이프', '이스케잎'],
    device: ['디바이스', '디바이즈'], boarding: ['보딩', '보오딩', '보딩그'], station: ['스테이션', '스테이숀'],
    view: ['뷰'], finder: ['파인더', '화인더'], hi: ['하이', '에이치아이'], position: ['포지션', '포지숀', '포지쎤'],
    green: ['그린'], area: ['에어리어', '에리어', '에어리아', '에리아', '아레아'],
    indicator: ['인디케이터', '인디게이터', '인디케이타'],
    biohazard: ['바이오해저드', '바이오하자드', '바이오해자드', '바이오하저드'], bag: ['백', '배그', '빽'],
    hood: ['후드'], actuation: ['액추에이션', '액츄에이션', '액튜에이션'], ring: ['링'],
    starter: ['스타터', '스타트', '스타타'], candle: ['캔들', '캔덜'], toggle: ['토글'],
    body: ['바디', '보디'], belt: ['벨트'], neck: ['넥', '넼'],
    siren: ['사이렌'], mask: ['마스크'], cartridge: ['카트리지', '카트릿지'], spark: ['스파크'],
    monitoring: ['모니터링'], band: ['밴드'], chain: ['체인'], tube: ['튜브'], gown: ['가운'],
    a: ['에이'], b: ['비'], c: ['씨', '시'], d: ['디']
  };

  // 한글 모음 통일
  function foldVowels(s) {
    let out = '';
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        const o = c - 0xAC00, cho = Math.floor(o / 588), jung = Math.floor((o % 588) / 28), jong = o % 28;
        let j = jung;
        if (j === 1 || j === 3 || j === 7) j = 5;      // ㅐ ㅒ ㅖ → ㅔ
        else if (j === 10 || j === 11) j = 15;         // ㅙ ㅚ → ㅞ
        out += String.fromCharCode(0xAC00 + cho * 588 + j * 28 + jong);
      } else out += ch;
    }
    return out;
  }

  const TRANSLIT_PAIRS = Object.entries(TRANSLIT)
    .flatMap(([en, kos]) => kos.map(ko => [foldVowels(ko), en]))
    .sort((x, y) => y[0].length - x[0].length);

  function base(s) {
    return foldVowels(String(s || '').normalize('NFC').toLowerCase()
      .replace(/[\s'"‘’“”`·.,:;!?()\[\]{}\/]/g, ''));
  }
  function canon(s) {
    let t = base(s);
    for (const [ko, en] of TRANSLIT_PAIRS) if (t.includes(ko)) t = t.split(ko).join(en);
    return t.replace(/[-~～_]/g, '');
  }

  // 숫자 비교용: 한글 숫자 → 아라비아 숫자, 단위 통일
  const NATIVE = [['열하나', 11], ['열한', 11], ['열둘', 12], ['열두', 12], ['열셋', 13], ['열세', 13], ['열넷', 14], ['열네', 14],
    ['열다섯', 15], ['열여섯', 16], ['열일곱', 17], ['열여덟', 18], ['열아홉', 19],
    ['스물', 20], ['서른', 30], ['마흔', 40], ['쉰', 50], ['예순', 60], ['일흔', 70], ['여든', 80], ['아흔', 90], ['열', 10], ['아홉', 9], ['여덟', 8], ['일곱', 7], ['여섯', 6], ['다섯', 5],
    ['넷', 4], ['네', 4], ['셋', 3], ['세', 3], ['석', 3], ['둘', 2], ['두', 2], ['하나', 1], ['한', 1]];
  const SINO = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
  // "백오십사" → 154, "이삼" → "2~3"
  function sinoToNum(w) {
    const out = []; let total = 0, cur = 0, hasCur = false;
    for (const ch of w) {
      if (ch in SINO) {
        if (hasCur) { out.push(total + cur); total = 0; }
        cur = SINO[ch]; hasCur = true;
      } else {
        const m = ch === '십' ? 10 : ch === '백' ? 100 : 1000;
        total += (hasCur ? cur : 1) * m; cur = 0; hasCur = false;
      }
    }
    out.push(total + cur);
    return out.join('~');
  }
  function numParts(s) {
    let t = String(s || '').normalize('NFC').toLowerCase()
      .replace(/[\s'"‘’“”`·.,:;!?()\[\]{}\/]/g, '')
      .replace(/리터|ℓ/g, 'l').replace(/미터/g, 'm').replace(/킬로그램|키로그램|킬로|키로/g, 'kg')
      .replace(/번/g, '회').replace(/장/g, '매')
      .replace(/(에서|부터|[-～])/g, '~');
    for (const [w, n] of NATIVE) t = t.split(w).join(String(n));
    t = t.replace(/[일이삼사오육륙칠팔구십백천]+/g, sinoToNum);
    const nums = t.match(/\d+(\.\d+)?/g) || [];
    const unit = foldVowels(t.replace(/\d+(\.\d+)?/g, '').replace(/[~약]/g, ''));
    return { nums, unit };
  }
  function numEqual(ans, val) {
    const a = numParts(ans), v = numParts(val);
    if (!a.nums.length || a.nums.join(',') !== v.nums.join(',')) return false;
    return v.unit === '' || v.unit === a.unit || (a.unit && v.unit.startsWith(a.unit));
  }

  function isCorrect(blank, value) {
    const v = canon(value);
    if (!v) return false;
    return blank.ok.some(a => canon(a) === v || (/\d/.test(a) && numEqual(a, value)));
  }
  function groupById(id) { return DATA.find(g => g.id === id); }
  function blankCount(g) { return g.images.reduce((n, im) => n + im.blanks.length, 0); }
  function key(gid, ii, bi) { return gid + '|' + ii + '|' + bi; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // 시험 내용은 저장하지 않음: 포털에서 뒤로 나갔다 들어오면 이름·사번부터 새로 시작
  function save() { /* 의도적으로 저장 안 함 */ }
  function clearOld() { try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* 무시 */ } }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function show(view) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // 지금 치는 시험 타입 표시: "TYPE C · CHK 정답 확인" / "TYPE A · 실전"
  function setTypeBadge(el) {
    el.textContent = 'TYPE ' + state.level + ' · ' + (state.chk ? 'CHK 정답 확인' : '실전');
    el.classList.toggle('chk', state.chk);
  }

  // 난이도별 무작위 출제 비율: [핵심 단어 비율, 나머지 단어 비율]
  const LEVELS = { A: [0.75, 0], B: [0.9, 0.25], C: [0.95, 0.5] };
  function pickBlanks(im, level) {
    const core = [], extra = [];
    im.blanks.forEach((b, i) => (b.e ? extra : core).push(i));
    const [rc, re] = LEVELS[level] || LEVELS.A;
    const nc = Math.min(core.length, Math.max(2, Math.round(core.length * rc)));
    const picks = shuffle(core).slice(0, nc).concat(shuffle(extra).slice(0, Math.round(extra.length * re)));
    return picks.sort((a, b) => a - b);
  }

  /* ---------------- 1. 장비 선택 ---------------- */
  function renderSelect() {
    const grid = $('#equip-grid');
    grid.innerHTML = DATA.map(g => `
      <button type="button" class="equip${state.selected.includes(g.id) ? ' on' : ''}" data-id="${g.id}">
        <span class="equip-icon"><i class="ph-fill ${g.icon}"></i></span>
        <span class="equip-info">
          <span class="equip-title">${esc(g.title)}</span>
        </span>
        <span class="equip-check"><i class="ph-bold ph-check"></i></span>
      </button>`).join('');
    $('#in-name').value = state.name;
    $('#in-emp').value = state.emp;
    $$('#level-seg button').forEach(b => b.classList.toggle('on', b.dataset.level === state.level));
    $('#in-chk').checked = state.chk;
    updateSelCount();
  }

  function updateSelCount() {
    $('#sel-count').textContent = state.selected.length + '개';
    $('#btn-all').textContent = state.selected.length === DATA.length ? '전체 해제' : '전체 선택';
  }

  function bindSelect() {
    $('#equip-grid').addEventListener('click', e => {
      const btn = e.target.closest('.equip'); if (!btn) return;
      const id = btn.dataset.id;
      if (state.selected.includes(id)) state.selected = state.selected.filter(x => x !== id);
      else state.selected.push(id);
      state.selected = DATA.map(g => g.id).filter(x => state.selected.includes(x));
      btn.classList.toggle('on');
      updateSelCount();
    });
    $('#btn-all').addEventListener('click', () => {
      state.selected = state.selected.length === DATA.length ? [] : DATA.map(g => g.id);
      renderSelect();
    });
    $('#level-seg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      state.level = b.dataset.level;
      $$('#level-seg button').forEach(x => x.classList.toggle('on', x === b));
    });
    $('#in-chk').addEventListener('change', e => { state.chk = e.target.checked; });
    $('#btn-start').addEventListener('click', startExam);
  }

  function startExam() {
    const nameEl = $('#in-name');
    state.name = nameEl.value.trim();
    state.emp = $('#in-emp').value.trim();
    if (!state.name) {
      nameEl.classList.remove('error'); void nameEl.offsetWidth; nameEl.classList.add('error');
      nameEl.focus(); toast('이름을 입력해 주세요'); return;
    }
    if (!state.selected.length) { toast('시험 볼 장비를 1개 이상 선택해 주세요'); return; }

    state.exam = state.selected.map(gid => {
      const g = groupById(gid);
      return {
        gid,
        images: g.images.map((im, ii) => {
          return { ii, picks: pickBlanks(im, state.level) };
        })
      };
    });
    state.answers = {};
    state.page = 0;
    state.submitted = false;
    state.startedAt = new Date().toISOString();
    state.finishedAt = null;
    save();
    openExam();
  }

  /* ---------------- 사진 + 빈칸 렌더링 ---------------- */
  function photoHTML(gid, ii, picks, mode) {
    const g = groupById(gid); const im = g.images[ii];
    const blanks = picks.map(bi => {
      const b = im.blanks[bi];
      const k = key(gid, ii, bi);
      const val = state.answers[k] || '';
      const style = `left:${(b.x / im.w * 100).toFixed(3)}%;top:${(b.y / im.h * 100).toFixed(3)}%;width:${(b.w / im.w * 100).toFixed(3)}%;height:${(b.h / im.h * 100).toFixed(3)}%`;
      let cls = 'blank';
      let extra = '';
      if (mode === 'review') {
        const ok = isCorrect(b, val);
        cls += ok ? ' ok' : ' ng' + (val ? '' : ' empty');
        if (!ok) extra = `<span class="correct">${esc(b.a)}</span>`;
      } else cls += state.chk && isCorrect(b, val) ? ' live-ok' : ' live-ng';   // CHK 켜면 입력 즉시 정답이면 초록, 끄면 끝까지 빨강
      return `<div class="${cls}" style="${style}" data-h="${b.h}">
        <input type="text" data-k="${k}" value="${esc(val)}" ${mode === 'review' ? 'readonly tabindex="-1"' : ''}
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next" aria-label="빈칸">${extra}</div>`;
    }).join('');
    return `<div class="sheet"><div class="photo" data-w="${im.w}">
      <img src="${im.src}" alt="${esc(g.title)} 교범 사진" draggable="false">${blanks}</div></div>`;
  }

  // 사진 크기에 맞춰 입력칸 글자 크기 조절
  const ro = ('ResizeObserver' in window) ? new ResizeObserver(entries => entries.forEach(en => sizePhoto(en.target))) : null;
  function sizePhoto(photo) {
    const scale = photo.clientWidth / parseFloat(photo.dataset.w);
    if (!scale) return;
    $$('.blank', photo).forEach(el => {
      const px = Math.max(10, parseFloat(el.dataset.h) * scale * 0.72);
      el.querySelector('input').style.fontSize = px + 'px';
      const c = el.querySelector('.correct'); if (c) c.style.fontSize = Math.max(10, px * 0.85) + 'px';
    });
  }
  function watchPhotos(root) {
    $$('.photo', root).forEach(p => { sizePhoto(p); if (ro) ro.observe(p); });
  }
  window.addEventListener('resize', () => $$('.photo').forEach(sizePhoto));

  /* ---------------- 2. 시험 ---------------- */
  function totals() {
    let total = 0, filled = 0;
    state.exam.forEach(sec => sec.images.forEach(im => im.picks.forEach(bi => {
      total++; if ((state.answers[key(sec.gid, im.ii, bi)] || '').trim()) filled++;
    })));
    return { total, filled };
  }
  function secFilled(sec) {
    let t = 0, f = 0;
    sec.images.forEach(im => im.picks.forEach(bi => { t++; if ((state.answers[key(sec.gid, im.ii, bi)] || '').trim()) f++; }));
    return { t, f };
  }

  function openExam() {
    $('#exam-name').textContent = state.name + (state.emp ? ' (' + state.emp + ')' : '');
    setTypeBadge($('#exam-type'));
    show('exam');
    renderPage();
  }

  function renderTabs() {
    $('#exam-tabs').innerHTML = state.exam.map((sec, i) => {
      const g = groupById(sec.gid); const { t, f } = secFilled(sec);
      return `<button type="button" class="tab${i === state.page ? ' on' : ''}${f === t ? ' done' : ''}" data-p="${i}">
        ${esc(g.title)} <span class="tab-n">${f}/${t}</span></button>`;
    }).join('');
    const on = $('#exam-tabs .tab.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderProgress() {
    const { total, filled } = totals();
    $('#exam-progress').innerHTML = `입력 <b>${filled}</b> / ${total}<div class="bar"><i style="width:${total ? filled / total * 100 : 0}%"></i></div>`;
  }

  function renderPage() {
    const sec = state.exam[state.page]; const g = groupById(sec.gid);
    const body = $('#exam-body');
    body.innerHTML = `<div class="inner">
      <div class="sec-title"><i class="ph-fill ${g.icon}"></i><div><b>${esc(g.title)}</b><small>${esc(g.sub)}</small></div></div>
      ${sec.images.map(im => photoHTML(sec.gid, im.ii, im.picks, 'exam')).join('')}
    </div>`;
    body.scrollTop = 0;
    watchPhotos(body);
    renderTabs(); renderProgress();
    $('#btn-prev').disabled = state.page === 0;
    const last = state.page === state.exam.length - 1;
    const next = $('#btn-next');
    next.classList.toggle('btn-nav--score', last);
    next.innerHTML = last ? '<i class="ph-bold ph-check-circle"></i> 점수 확인' : '다음 <i class="ph-bold ph-caret-right"></i>';
  }

  function goPage(p) {
    if (p < 0 || p >= state.exam.length) return;
    state.page = p; save(); renderPage();
  }

  function bindExam() {
    const body = $('#exam-body');
    body.addEventListener('input', e => {
      const inp = e.target; if (!inp.dataset.k) return;
      state.answers[inp.dataset.k] = inp.value;
      const [gid, ii, bi] = inp.dataset.k.split('|');
      const ok = state.chk && isCorrect(groupById(gid).images[+ii].blanks[+bi], inp.value);
      inp.parentElement.classList.toggle('live-ok', ok);
      inp.parentElement.classList.toggle('live-ng', !ok);
      save(); renderProgress();
    });
    body.addEventListener('change', () => renderTabs());
    // Enter -> 다음 빈칸
    body.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.isComposing) return;
      const all = $$('.blank input', body); const i = all.indexOf(e.target);
      if (i < 0) return;
      e.preventDefault();
      if (all[i + 1]) all[i + 1].focus(); else e.target.blur();
      renderTabs();
    });
    $('#exam-tabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) goPage(+t.dataset.p); });
    $('#btn-prev').addEventListener('click', () => goPage(state.page - 1));
    $('#btn-next').addEventListener('click', () => {
      if (state.page < state.exam.length - 1) goPage(state.page + 1);
      else submit();
    });
  }

  function submit() {
    const { total, filled } = totals();
    const msg = filled < total
      ? `아직 ${total - filled}개 빈칸이 비어 있습니다.\n그래도 점수를 확인할까요?\n(확인 후에는 답을 고칠 수 없습니다)`
      : '점수를 확인할까요?\n(확인 후에는 답을 고칠 수 없습니다)';
    if (!confirm(msg)) return;
    state.submitted = true;
    state.finishedAt = new Date().toISOString();
    save();
    openResult();
  }

  /* ---------------- 3. 결과 ---------------- */
  function grade() {
    let total = 0, correct = 0;
    const secs = state.exam.map(sec => {
      const g = groupById(sec.gid); let t = 0, c = 0;
      sec.images.forEach(im => im.picks.forEach(bi => {
        t++; if (isCorrect(g.images[im.ii].blanks[bi], state.answers[key(sec.gid, im.ii, bi)])) c++;
      }));
      total += t; correct += c;
      return { g, t, c };
    });
    return { total, correct, score: total ? Math.round(correct / total * 100) : 0, secs };
  }

  function fmtDate(iso) {
    const d = new Date(iso); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openResult() {
    const r = grade();
    $('#res-name').textContent = state.name;
    $('#res-emp').textContent = state.emp ? '사번 ' + state.emp : '';
    setTypeBadge($('#res-type'));
    $('#res-date').textContent = '응시 ' + fmtDate(state.startedAt) + '  ·  제출 ' + fmtDate(state.finishedAt);
    $('#res-score').textContent = r.score;
    const ring = $('#score-ring');
    ring.style.setProperty('--p', r.score);
    ring.style.setProperty('--c', r.score >= 80 ? '#10B981' : r.score >= 60 ? '#FF8A00' : '#EF4444');
    $('#res-count').innerHTML = `정답 <span class="ok">${r.correct}</span> · 오답 <span class="ng">${r.total - r.correct}</span> · 전체 ${r.total}문항`;
    $('#res-table').innerHTML = r.secs.map(s => `
      <div class="res-row"><b>${esc(s.g.title)} <small style="color:rgba(255,255,255,.5);font-weight:600">${esc(s.g.sub)}</small></b>
        <span>${s.c} / ${s.t}</span>
        <div class="bar"><i style="width:${s.t ? s.c / s.t * 100 : 0}%"></i></div></div>`).join('');
    $('#review').innerHTML = '';
    $('#btn-review').innerHTML = '<i class="ph-bold ph-magnifying-glass"></i> 오답 확인';
    show('result');
    $('#view-result').scrollTop = 0;
  }

  function toggleReview() {
    const rv = $('#review');
    if (rv.innerHTML) { rv.innerHTML = ''; $('#btn-review').innerHTML = '<i class="ph-bold ph-magnifying-glass"></i> 오답 확인'; return; }
    const r = grade();
    rv.innerHTML = state.exam.map((sec, i) => {
      const g = groupById(sec.gid); const s = r.secs[i];
      return `<div class="sec-title"><i class="ph-fill ${g.icon}"></i><div><b>${esc(g.title)}</b><small>${esc(g.sub)}</small></div>
        <span class="sec-score">${s.c} / ${s.t}</span></div>
        ${sec.images.map(im => photoHTML(sec.gid, im.ii, im.picks, 'review')).join('')}`;
    }).join('');
    $('#btn-review').innerHTML = '<i class="ph-bold ph-eye-slash"></i> 오답 닫기';
    watchPhotos(rv);
    rv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindResult() {
    $('#btn-review').addEventListener('click', toggleReview);
    $('#btn-new').addEventListener('click', () => {
      if (!confirm('새 시험을 시작할까요?\n지금 결과 화면은 사라집니다.')) return;
      state.exam = null; state.answers = {}; state.submitted = false; state.page = 0;
      save(); renderSelect(); show('select');
      $('#view-select').scrollTop = 0;
    });
  }

  /* ---------------- 시작 ---------------- */
  function init() {
    clearOld();
    bindSelect(); bindExam(); bindResult();
    renderSelect();
    show('select');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
