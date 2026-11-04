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
    name: '', emp: '', level: 0.5,
    selected: [],       // 선택한 장비 id 목록 (화면 순서 유지)
    exam: null,         // [{ gid, images: [{ ii, picks: [blankIndex...] }] }]
    answers: {},        // key "g|i|b" -> 입력값
    page: 0,
    submitted: false,
    startedAt: null, finishedAt: null
  };

  /* ---------------- 공통 ---------------- */
  function norm(s) {
    return String(s || '').normalize('NFC').toLowerCase()
      .replace(/[\s'"‘’“”`·.,()\[\]{}\-~/]/g, '');
  }
  function isCorrect(blank, value) {
    const v = norm(value);
    if (!v) return false;
    return blank.ok.some(a => norm(a) === v);
  }
  function groupById(id) { return DATA.find(g => g.id === id); }
  function blankCount(g) { return g.images.reduce((n, im) => n + im.blanks.length, 0); }
  function key(gid, ii, bi) { return gid + '|' + ii + '|' + bi; }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function save() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 시 무시 */ } }
  function load() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) { const s = JSON.parse(raw); if (s && typeof s === 'object') state = Object.assign(state, s); }
    } catch (e) { /* 무시 */ }
  }

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

  /* ---------------- 1. 장비 선택 ---------------- */
  function renderSelect() {
    const grid = $('#equip-grid');
    grid.innerHTML = DATA.map(g => `
      <button type="button" class="equip${state.selected.includes(g.id) ? ' on' : ''}" data-id="${g.id}">
        <span class="equip-icon"><i class="ph-fill ${g.icon}"></i></span>
        <span class="equip-info">
          <span class="equip-title">${esc(g.title)}</span>
          <span class="equip-sub">${esc(g.sub)}</span>
        </span>
        <span class="equip-check"><i class="ph-bold ph-check"></i></span>
      </button>`).join('');
    $('#in-name').value = state.name;
    $('#in-emp').value = state.emp;
    $$('#level-seg button').forEach(b => b.classList.toggle('on', parseFloat(b.dataset.level) === state.level));
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
      state.level = parseFloat(b.dataset.level);
      $$('#level-seg button').forEach(x => x.classList.toggle('on', x === b));
    });
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
          const n = im.blanks.length;
          const k = Math.min(n, Math.max(2, Math.round(n * state.level)));
          const picks = shuffle(im.blanks.map((_, i) => i)).slice(0, k).sort((a, b) => a - b);
          return { ii, picks };
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
      } else if (val) cls += ' filled';
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
      inp.parentElement.classList.toggle('filled', !!inp.value.trim());
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
    load();
    // 데이터가 바뀌어 저장된 시험과 맞지 않으면 초기화
    if (state.exam && !state.exam.every(sec => groupById(sec.gid))) { state.exam = null; state.submitted = false; }
    state.selected = (state.selected || []).filter(id => groupById(id));
    bindSelect(); bindExam(); bindResult();
    renderSelect();
    if (state.exam && state.submitted) openResult();
    else if (state.exam) openExam();
    else show('select');
  }
  document.addEventListener('DOMContentLoaded', init);
})();
