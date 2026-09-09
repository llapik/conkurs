/* ============================================================
   CodeCraft Inc. — логика приложения
   Платформа с несколькими «отделами» (курсами) на общем движке:
   стартовый экран-хаб выбирает отдел, дальше — знакомая механика
   уровней допуска, автопроверки и бейджей, но данные и прогресс
   у каждого отдела свои (state.courses[courseId]).
   ============================================================ */

(function () {
  'use strict';

  const BADGE_TIERS = {
    intern: { icon: 'id-card', name: 'Пропуск стажёра' },
    junior: { icon: 'wrench', name: 'Пропуск джуниора' },
    middle: { icon: 'brain', name: 'Пропуск мидла' }
  };
  const ROLE_LABELS = { 1: 'Стажёр', 2: 'Джуниор', 3: 'Мидл' };

  let state = Storage.load();
  let currentView = state.activeCourseId ? (state.courses[state.activeCourseId].currentLevel || 1) : 'hub';
  const lastCaseResult = {};

  /* ---------------- Доступ к текущему отделу (курсу) ---------------- */

  function course(id) {
    return COURSES[id || state.activeCourseId];
  }
  function courseState(id) {
    return state.courses[id || state.activeCourseId];
  }

  /* ---------------- Утилиты ---------------- */

  function icon(name, extraClass) {
    return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function saveState() {
    if (state.activeCourseId && (currentView === 1 || currentView === 2 || currentView === 3)) {
      courseState().currentLevel = currentView;
    }
    Storage.save(state);
    updateHeaderWidgets();
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function showToast(message, iconName) {
    const region = document.getElementById('toast-region');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = (iconName ? icon(iconName) : '') + '<span>' + escapeHtml(message) + '</span>';
    region.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- Конфетти ---------------- */

  const confettiCanvas = document.getElementById('confetti-canvas');
  const cctx = confettiCanvas.getContext('2d');
  let confettiParticles = [];
  let confettiRAF = null;

  function resizeConfettiCanvas() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfettiCanvas);
  resizeConfettiCanvas();

  function fireConfetti() {
    if (prefersReducedMotion()) return;
    const colors = ['#55d6ff', '#48ffc0', '#b892ff', '#ff8fd6', '#ffd479'];
    const count = 120;
    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 3,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        life: 0
      });
    }
    if (!confettiRAF) confettiRAF = requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;
      p.rotation += p.vr;
      p.life += 1;
      cctx.save();
      cctx.translate(p.x, p.y);
      cctx.rotate(p.rotation);
      cctx.fillStyle = p.color;
      cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      cctx.restore();
    });
    confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 40 && p.life < 420);
    if (confettiParticles.length > 0) {
      confettiRAF = requestAnimationFrame(tickConfetti);
    } else {
      cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiRAF = null;
    }
  }

  /* ---------------- Проверка кейсов (уровень 2) ---------------- */

  function extractFunction(code, fnName) {
    // eslint-disable-next-line no-new-func
    const factory = new Function(code + `\n;return (typeof ${fnName} !== 'undefined') ? ${fnName} : undefined;`);
    return factory();
  }

  function runXssCheck(fn) {
    const items = [];
    let allPass = true;

    let normal;
    try { normal = fn('Привет!'); } catch (err) { normal = null; }
    const functionalOk = typeof normal === 'string' && normal.includes('Привет');
    items.push({ text: 'Обычный текст комментария по-прежнему отображается', pass: functionalOk,
      detail: functionalOk ? '' : 'функция должна вернуть строку, содержащую исходный текст пользователя' });
    if (!functionalOk) allPass = false;

    let dangerous;
    try { dangerous = fn('<img src=x onerror="alert(1)">'); } catch (err) { dangerous = ''; }
    const escaped = typeof dangerous === 'string' && !/<img[^>]*onerror/i.test(dangerous);
    items.push({ text: 'Разметка <img onerror=...> экранируется, а не исполняется', pass: escaped,
      detail: escaped ? '' : `результат содержит невырезанный тег: ${escapeHtml(dangerous)}` });
    if (!escaped) allPass = false;

    let dangerous2;
    try { dangerous2 = fn('<script>alert(1)</script>'); } catch (err) { dangerous2 = ''; }
    const escaped2 = typeof dangerous2 === 'string' && !/<script/i.test(dangerous2);
    items.push({ text: 'Тег <script> экранируется', pass: escaped2,
      detail: escaped2 ? '' : `результат содержит: ${escapeHtml(dangerous2)}` });
    if (!escaped2) allPass = false;

    return { pass: allPass, items };
  }

  function runA11yMenuCheck(fn) {
    const items = [];
    let allPass = true;

    let output;
    try { output = fn(false); } catch (err) {
      return { pass: false, error: `Ошибка при выполнении: ${err.message}`, items: [] };
    }
    const hasButton = typeof output === 'string' && /<button[\s>]/i.test(output);
    items.push({ text: 'Используется семантический <button>, а не <div>', pass: hasButton,
      detail: hasButton ? '' : 'в разметке нет тега <button> — интерактивный элемент должен быть кнопкой, чтобы получать фокус клавиатурой' });
    if (!hasButton) allPass = false;

    const hasAriaExpanded = typeof output === 'string' && /aria-expanded\s*=/i.test(output);
    items.push({ text: 'Состояние меню (открыто/закрыто) доступно через aria-expanded', pass: hasAriaExpanded,
      detail: hasAriaExpanded ? '' : 'добавьте атрибут aria-expanded="true|false", чтобы скринридер знал текущее состояние меню' });
    if (!hasAriaExpanded) allPass = false;

    return { pass: allPass, items };
  }

  function runPatternChecks(caseDef, code) {
    const items = [];
    let allPass = true;
    caseDef.patternChecks.forEach(check => {
      let pass;
      if (typeof check.minCount === 'number') {
        const matches = code.match(check.regex);
        pass = (matches ? matches.length : 0) >= check.minCount;
      } else if (check.mustMatch) {
        pass = check.mustMatch.test(code);
      } else {
        pass = !check.mustNotMatch.test(code);
      }
      if (!pass) allPass = false;
      items.push({ text: check.label, pass, detail: pass ? '' : check.message });
    });
    return { pass: allPass, items };
  }

  function runCaseCheck(caseDef, code) {
    if (caseDef.checkType === 'pattern') {
      return runPatternChecks(caseDef, code);
    }

    let fn;
    try {
      fn = extractFunction(code, caseDef.functionName);
    } catch (err) {
      return { pass: false, error: `Код не выполняется: ${err.message}`, items: [] };
    }
    if (typeof fn !== 'function') {
      return { pass: false, error: `Не найдена функция ${caseDef.functionName}. Проверьте, что вы не удалили или не переименовали её.`, items: [] };
    }

    if (caseDef.checkType === 'js-test-xss') {
      try { return runXssCheck(fn); }
      catch (err) { return { pass: false, error: `Ошибка при выполнении: ${err.message}`, items: [] }; }
    }
    if (caseDef.checkType === 'js-test-a11y') {
      try { return runA11yMenuCheck(fn); }
      catch (err) { return { pass: false, error: `Ошибка при выполнении: ${err.message}`, items: [] }; }
    }

    const items = [];
    let allPass = true;
    caseDef.tests.forEach(t => {
      let actual, threw = false, message = '';
      try {
        actual = fn(...t.args);
      } catch (err) {
        threw = true; message = err.message;
      }
      const hasTolerance = typeof t.tolerance === 'number';
      const pass = !threw && (hasTolerance
        ? typeof actual === 'number' && Math.abs(actual - t.expected) <= t.tolerance
        : deepEqual(actual, t.expected));
      if (!pass) allPass = false;
      const actualStr = typeof actual === 'number' ? Number(actual.toFixed(4)) : JSON.stringify(actual);
      const expectedStr = (hasTolerance ? '≈' : '') + JSON.stringify(t.expected) + (hasTolerance ? ` (±${t.tolerance})` : '');
      items.push({
        text: t.description,
        pass,
        detail: threw ? `выброшена ошибка: ${message}` : `получено ${actualStr}, ожидалось ${expectedStr}`
      });
    });

    if (allPass && caseDef.forbidPattern && caseDef.forbidPattern.test(code)) {
      allPass = false;
      items.push({ text: 'Оптимальность решения', pass: false, detail: caseDef.forbidMessage });
    }

    return { pass: allPass, items, error: null };
  }

  /* ---------------- Прогресс / бейджи / разблокировка ---------------- */

  function unlockLevel(courseId, n) {
    const cs = courseState(courseId);
    if (cs.accessLevel < n) cs.accessLevel = n;
  }

  function awardBadge(courseId, key) {
    const cs = courseState(courseId);
    if (!cs.badges.includes(key)) cs.badges.push(key);
  }

  function computeCourseProgress(courseId) {
    const def = COURSES[courseId];
    const cs = state.courses[courseId];

    const l1total = def.level1.quiz.length;
    const l1answered = Object.keys(cs.level1.checked).length;
    const l1progress = cs.level1.completed ? 34 : Math.round((l1answered / l1total) * 34);

    const l2total = def.level2.cases.length;
    const l2solved = Object.values(cs.level2.cases).filter(c => c && c.solved).length;
    const l2progress = cs.level2.completed ? 33 : Math.round((l2solved / l2total) * 33);

    const requiredFields = [def.level3.prompts[0].id, def.level3.prompts[1].id, ...def.level3.reflection.questions.map(q => q.id)];
    let filled = 0;
    requiredFields.forEach(id => {
      const val = (cs.level3.prompts[id] || cs.level3.reflection[id] || '').trim();
      if (val.length >= 10) filled += 1;
    });
    const l3progress = cs.level3.submitted ? 33 : Math.round((filled / requiredFields.length) * 33);

    return Math.min(100, l1progress + l2progress + l3progress);
  }

  function updateHeaderWidgets() {
    const isHub = currentView === 'hub';
    document.getElementById('level-nav').style.display = isHub ? 'none' : '';
    document.getElementById('access-widget').style.display = isHub ? 'none' : '';
    document.getElementById('brand-dept').textContent = isHub ? 'выбор отдела' : course().meta.dept;

    if (!isHub) {
      const cs = courseState();
      const percent = computeCourseProgress(state.activeCourseId);
      document.getElementById('access-percent-label').textContent = percent + '%';
      document.getElementById('access-role-label').textContent = 'Уровень доступа: ' + ROLE_LABELS[cs.accessLevel];
      const fill = document.getElementById('access-bar-fill');
      fill.style.width = percent + '%';
      document.getElementById('access-bar').setAttribute('aria-valuenow', String(percent));

      document.querySelectorAll('.level-tab').forEach(tab => {
        const lvl = Number(tab.dataset.level);
        const locked = lvl > cs.accessLevel;
        tab.disabled = locked;
        const lockIcon = tab.querySelector('.lock-icon');
        if (lockIcon) lockIcon.style.display = locked ? '' : 'none';
        tab.setAttribute('aria-current', lvl === currentView ? 'page' : 'false');
        tab.classList.toggle('is-complete',
          (lvl === 1 && cs.level1.completed) ||
          (lvl === 2 && cs.level2.completed) ||
          (lvl === 3 && cs.level3.submitted));
      });
    }

    renderEmployeeCard();
  }

  function renderEmployeeCard() {
    const name = state.name && state.name.trim() ? state.name.trim() : 'Без имени';
    const roleText = state.activeCourseId ? ROLE_LABELS[courseState().accessLevel] + ' · ' + course().meta.dept : 'ещё не выбрал отдел';
    const overallPercent = Math.round(COURSE_ORDER.reduce((sum, id) => sum + computeCourseProgress(id), 0) / COURSE_ORDER.length);
    const cardHtml = `
      <div class="employee-card">
        <div class="employee-card-row">
          <div class="employee-avatar" aria-hidden="true">${icon('user')}</div>
          <div class="employee-meta">
            <div class="emp-name">${escapeHtml(name)}</div>
            <div class="emp-role">${escapeHtml(roleText)}</div>
          </div>
          <div class="employee-id">ID: CC-${(name.length * 17 + 1000) % 9000 + 1000}<br>Общий прогресс: ${overallPercent}%</div>
        </div>
      </div>`;
    const container = document.getElementById('employee-card');
    if (container) container.innerHTML = cardHtml;

    const badgeListHtml = COURSE_ORDER.map(courseId => {
      const def = COURSES[courseId];
      const cs = state.courses[courseId];
      const chips = Object.keys(BADGE_TIERS).map(tier => {
        const b = BADGE_TIERS[tier];
        const earned = cs.badges.includes(tier);
        return `<div class="badge-chip ${earned ? 'earned' : ''}" title="${escapeHtml(b.name)} — ${escapeHtml(def.meta.dept)}">
          <span class="badge-icon">${icon(b.icon)}</span>
          <span class="badge-name">${escapeHtml(b.name)}</span>
        </div>`;
      }).join('');
      return `
        <div class="badge-group">
          <div class="badge-group-label">${icon(def.meta.icon)} ${escapeHtml(def.meta.dept)}</div>
          <div class="badge-list">${chips}</div>
        </div>`;
    }).join('');
    const badgeList = document.getElementById('badge-list');
    if (badgeList) badgeList.innerHTML = badgeListHtml;
  }

  /* ---------------- Навигация: хаб ↔ отделы ↔ уровни ---------------- */

  function goToHub() {
    currentView = 'hub';
    saveState();
    renderCurrentView();
    const root = document.getElementById('view-root');
    root.focus({ preventScroll: true });
    root.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function enterCourse(courseId) {
    state.activeCourseId = courseId;
    currentView = courseState().currentLevel || 1;
    saveState();
    renderCurrentView();
    const root = document.getElementById('view-root');
    root.focus({ preventScroll: true });
    root.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function goToView(n) {
    if (!state.activeCourseId) return;
    if (n > courseState().accessLevel) return;
    currentView = n;
    saveState();
    renderCurrentView();
    const root = document.getElementById('view-root');
    root.focus({ preventScroll: true });
    root.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  function renderCurrentView() {
    const scrollY = window.scrollY;
    const root = document.getElementById('view-root');
    if (currentView === 'hub') root.innerHTML = renderHub();
    else if (currentView === 1) root.innerHTML = renderLevel1();
    else if (currentView === 2) root.innerHTML = renderLevel2();
    else root.innerHTML = renderLevel3();
    updateHeaderWidgets();
    window.scrollTo(0, scrollY);
  }

  /* ---------------- ХАБ: выбор отдела ---------------- */

  function renderHub() {
    const cardsHtml = COURSE_ORDER.map(courseId => {
      const def = COURSES[courseId];
      const cs = state.courses[courseId];
      const percent = computeCourseProgress(courseId);
      const started = percent > 0 || cs.badges.length > 0;
      const earnedCount = cs.badges.length;
      return `
        <article class="hub-card glass">
          <div class="card-icon-badge hub-card-icon">${icon(def.meta.icon)}</div>
          <div class="hub-card-eyebrow">${escapeHtml(def.meta.dept)}</div>
          <h3>${escapeHtml(def.meta.title)}</h3>
          <p>${escapeHtml(def.meta.tagline)}</p>
          <div class="hub-card-progress">
            <div class="access-bar"><div class="access-bar-fill" style="width:${percent}%"></div></div>
            <span class="hub-card-progress-label">${ROLE_LABELS[cs.accessLevel]} · ${percent}% · бейджей ${earnedCount}/3</span>
          </div>
          <button type="button" class="btn btn-primary" data-action="enter-course" data-course-id="${courseId}">
            ${started ? 'Продолжить стажировку' : 'Начать стажировку'} ${icon('chevron-right')}
          </button>
        </article>`;
    }).join('');

    return `
      <section class="view-header">
        <span class="view-eyebrow">CodeCraft Inc.</span>
        <h1>Выберите отдел стажировки</h1>
        <p>Один движок, разные дисциплины: уровни допуска, бейджи и авто-проверка работают одинаково — контент разный. Прогресс по каждому отделу сохраняется отдельно.</p>
      </section>
      <div class="hub-grid">${cardsHtml}</div>
    `;
  }

  /* ---------------- УРОВЕНЬ 1 ---------------- */

  function renderLevel1() {
    const def = course().level1;
    const cs = courseState().level1;

    const cardsHtml = def.cards.map(c => `
      <article class="theory-card glass">
        <div class="card-icon-badge">${icon(c.icon)}</div>
        <h3>${escapeHtml(c.title)}</h3>
        <p>${escapeHtml(c.text)}</p>
      </article>
    `).join('');

    const total = def.quiz.length;
    const answered = Object.keys(cs.checked).length;

    const quizHtml = def.quiz.map((q, qi) => {
      const isChecked = !!cs.checked[q.id];
      const isCorrect = !!cs.correct[q.id];
      const selected = cs.answers[q.id] || [];
      const inputType = q.type === 'single' ? 'radio' : 'checkbox';

      const optionsHtml = q.options.map((opt, oi) => {
        const isSelected = selected.includes(oi);
        const isRightOpt = q.correct.includes(oi);
        let cls = '';
        if (isChecked) {
          if (isRightOpt) cls += ' opt-correct';
          if (isSelected && !isRightOpt) cls += ' opt-incorrect-selected';
        }
        return `
          <label class="quiz-option${cls}">
            <input type="${inputType}" name="quiz_${q.id}" value="${oi}"
              data-action="quiz-select" data-qid="${q.id}" data-qtype="${q.type}"
              ${isSelected ? 'checked' : ''} ${isChecked ? 'disabled' : ''}>
            <span>${escapeHtml(opt)}</span>
          </label>`;
      }).join('');

      const feedback = isChecked ? `
        <div class="quiz-feedback ${isCorrect ? 'right' : 'wrong'}">
          ${icon(isCorrect ? 'check-circle' : 'message')}
          <span>${escapeHtml(isCorrect ? q.feedbackRight : q.feedbackWrong)}</span>
        </div>` : '';

      const showCheckBtn = q.type === 'multi' && !isChecked;

      return `
        <div class="quiz-card glass ${isChecked ? (isCorrect ? 'is-correct' : 'is-wrong') : ''}" data-qid="${q.id}">
          <p class="quiz-question">${qi + 1}. ${escapeHtml(q.question)}</p>
          <div class="quiz-options">${optionsHtml}</div>
          ${showCheckBtn ? `<button type="button" class="btn btn-primary btn-sm" data-action="quiz-check" data-qid="${q.id}" ${selected.length === 0 ? 'disabled' : ''}>Проверить ответ</button>` : ''}
          ${feedback}
        </div>`;
    }).join('');

    let summaryHtml = '';
    if (answered >= total) {
      const score = Object.values(cs.correct).filter(Boolean).length;
      const passed = score >= def.passThreshold;
      summaryHtml = `
        <div class="quiz-summary glass">
          <div class="score-num">${score} / ${total}</div>
          <p>${passed
            ? 'Порог пройден — доступ к уровню «Джуниор» открыт.'
            : `Нужно набрать минимум ${def.passThreshold} из ${total}, чтобы получить пропуск стажёра.`}</p>
          ${!passed ? '<button type="button" class="btn btn-ghost" data-action="quiz-retry">Пройти квиз ещё раз</button>' : ''}
        </div>`;
    }

    const banner = cs.completed ? `
      <div class="level-complete-banner glass">
        ${icon('id-card', 'icon-lg')}
        <h2>Пропуск стажёра получен!</h2>
        <p>Загляните в карту сотрудника или переходите к практике джуниора.</p>
        <button type="button" class="btn btn-primary" data-action="goto-level" data-level="2">Перейти на уровень «Джуниор» ${icon('chevron-right')}</button>
      </div>` : '';

    return `
      <section class="view-header">
        <span class="view-eyebrow">${escapeHtml(course().meta.dept)} · Уровень допуска 01</span>
        <h1>Стажёр — ${escapeHtml(def.subtitle)}</h1>
        <p>Изучите карточки ниже, затем пройдите проверочный квиз — обратная связь приходит сразу после ответа.</p>
      </section>

      <div class="card-grid">${cardsHtml}</div>

      <div class="section-divider">Проверочный квиз · ${answered}/${total}</div>
      <p class="quiz-progress">Отвечено вопросов: ${answered} из ${total}. Порог для получения пропуска: ${def.passThreshold} правильных ответов.</p>
      ${quizHtml}
      ${summaryHtml}
      ${banner}
    `;
  }

  function handleQuizSelect(qid, qtype, value) {
    const cs = courseState().level1;
    const idx = Number(value);
    if (!cs.answers[qid]) cs.answers[qid] = [];
    if (qtype === 'single') {
      cs.answers[qid] = [idx];
      saveState();
      checkQuizAnswer(qid);
    } else {
      const arr = cs.answers[qid];
      const pos = arr.indexOf(idx);
      if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
      saveState();
      renderCurrentView();
    }
  }

  function checkQuizAnswer(qid) {
    const def = course().level1;
    const cs = courseState().level1;
    const q = def.quiz.find(x => x.id === qid);
    const selected = (cs.answers[qid] || []).slice().sort();
    const correct = q.correct.slice().sort();
    const isCorrect = deepEqual(selected, correct);
    cs.checked[qid] = true;
    cs.correct[qid] = isCorrect;
    saveState();
    renderCurrentView();
    maybeFinishLevel1();
  }

  function retryQuiz() {
    const cs = courseState().level1;
    cs.answers = {};
    cs.checked = {};
    cs.correct = {};
    saveState();
    renderCurrentView();
  }

  function maybeFinishLevel1() {
    const courseId = state.activeCourseId;
    const def = COURSES[courseId].level1;
    const cs = state.courses[courseId].level1;
    const total = def.quiz.length;
    const answered = Object.keys(cs.checked).length;
    if (answered < total || cs.completed) return;
    const score = Object.values(cs.correct).filter(Boolean).length;
    cs.score = score;
    if (score >= def.passThreshold) {
      cs.completed = true;
      unlockLevel(courseId, 2);
      awardBadge(courseId, 'intern');
      saveState();
      renderCurrentView();
      fireConfetti();
      showToast('Пропуск стажёра получен! Открыт доступ к уровню «Джуниор».', 'id-card');
    } else {
      saveState();
    }
  }

  /* ---------------- УРОВЕНЬ 2 ---------------- */

  function getCaseState(caseId) {
    const cs = courseState().level2;
    if (!cs.cases[caseId]) {
      const def = course().level2.cases.find(c => c.id === caseId);
      cs.cases[caseId] = { solved: false, code: def.code, attempts: 0 };
    }
    return cs.cases[caseId];
  }

  function renderLevel2() {
    const def = course().level2;
    const cs = courseState().level2;

    const casesHtml = def.cases.map(caseDef => {
      const cState = getCaseState(caseDef.id);
      const result = lastCaseResult[caseDef.id];

      let resultHtml = '';
      if (result) {
        if (result.error) {
          resultHtml = `<div class="case-result fail">
            <div class="reviewer-note"><span class="reviewer-avatar">${icon('message')}</span><span>${escapeHtml(result.error)}</span></div>
          </div>`;
        } else {
          const itemsHtml = result.items.map(it =>
            `<li class="${it.pass ? 'pass' : 'fail'}">${escapeHtml(it.text)}${it.detail ? ' — ' + escapeHtml(it.detail) : ''}</li>`
          ).join('');
          resultHtml = `<div class="case-result ${result.pass ? 'pass' : 'fail'}">
            <div class="reviewer-note">
              <span class="reviewer-avatar">${icon(result.pass ? 'check-circle' : 'message')}</span>
              <span>${result.pass ? 'Ревьюер доволен: все проверки пройдены.' : 'Ревьюер вернул на доработку — смотрите список проверок ниже.'}</span>
            </div>
            <ul class="test-list">${itemsHtml}</ul>
            ${result.pass ? `<div class="explanation-box">
              <strong>Что было не так:</strong>
              <p>${escapeHtml(caseDef.explanation)}</p>
              <pre class="code-editor" style="min-height:auto;border-radius:8px;">${escapeHtml(caseDef.solutionExample)}</pre>
            </div>` : ''}
          </div>`;
        }
      }

      return `
        <article class="case-card glass" data-case-id="${caseDef.id}">
          <div class="case-card-head">
            <h3>${escapeHtml(caseDef.title)}</h3>
            <div>
              <span class="case-lang-tag">${escapeHtml(caseDef.lang)}</span>
              ${cState.solved ? `<span class="case-status solved">${icon('check-circle')} исправлено</span>` : ''}
            </div>
          </div>
          <p class="case-task-text">${escapeHtml(caseDef.taskText)}</p>
          <div class="ai-suggestion-label">${icon('bot')} Предложение ИИ-ассистента (можно редактировать):</div>
          <div class="code-editor-wrap">
            <textarea class="code-editor" id="code-${caseDef.id}" data-case-id="${caseDef.id}"
              spellcheck="false" aria-label="Редактор кода для кейса ${escapeHtml(caseDef.title)}">${escapeHtml(cState.code)}</textarea>
          </div>
          <div class="case-actions">
            <button type="button" class="btn btn-primary" data-action="case-check" data-case-id="${caseDef.id}">${icon('play')} Проверить</button>
            <button type="button" class="btn btn-ghost btn-sm" data-action="case-reset" data-case-id="${caseDef.id}">${icon('undo')} Восстановить предложение ИИ</button>
          </div>
          <details class="hint-details"><summary>${icon('message')} Совет ревьюера</summary><p>${escapeHtml(caseDef.hint)}</p></details>
          ${resultHtml}
        </article>`;
    }).join('');

    const solvedCount = Object.values(cs.cases).filter(c => c && c.solved).length;
    const banner = cs.completed ? `
      <div class="level-complete-banner glass">
        ${icon('wrench', 'icon-lg')}
        <h2>Пропуск джуниора получен!</h2>
        <p>Доступ к уровню «Мидл» открыт.</p>
        <button type="button" class="btn btn-primary" data-action="goto-level" data-level="3">Перейти на уровень «Мидл» ${icon('chevron-right')}</button>
      </div>` : '';

    return `
      <section class="view-header">
        <span class="view-eyebrow">${escapeHtml(course().meta.dept)} · Уровень допуска 02</span>
        <h1>Джуниор — найдите, что не так</h1>
        <p>${escapeHtml(def.subtitle)}. В каждом кейсе — код, который якобы предложил ИИ-ассистент. Найдите баг, уязвимость или неоптимальность, исправьте прямо в редакторе и нажмите «Проверить».</p>
        <p class="quiz-progress">Исправлено кейсов: ${solvedCount} из ${def.cases.length}</p>
      </section>
      ${casesHtml}
      ${banner}
    `;
  }

  function handleCaseCheck(caseId) {
    const def = course().level2.cases.find(c => c.id === caseId);
    const textarea = document.getElementById('code-' + caseId);
    const code = textarea ? textarea.value : getCaseState(caseId).code;
    const cState = getCaseState(caseId);
    cState.code = code;
    cState.attempts += 1;

    const result = runCaseCheck(def, code);
    lastCaseResult[caseId] = result;
    const wasSolved = cState.solved;
    if (result.pass) cState.solved = true;
    saveState();
    renderCurrentView();

    if (result.pass && !wasSolved) {
      if (!prefersReducedMotion()) fireConfetti();
      showToast('Кейс «' + def.title + '» исправлен!', 'check-circle');
      maybeFinishLevel2();
    }
  }

  function handleCaseReset(caseId) {
    const def = course().level2.cases.find(c => c.id === caseId);
    const prev = getCaseState(caseId);
    courseState().level2.cases[caseId] = { solved: prev.solved, code: def.code, attempts: prev.attempts };
    delete lastCaseResult[caseId];
    saveState();
    renderCurrentView();
  }

  function maybeFinishLevel2() {
    const courseId = state.activeCourseId;
    const cs = state.courses[courseId].level2;
    if (cs.completed) return;
    const total = COURSES[courseId].level2.cases.length;
    const solved = Object.values(cs.cases).filter(c => c && c.solved).length;
    if (solved >= total) {
      cs.completed = true;
      unlockLevel(courseId, 3);
      awardBadge(courseId, 'junior');
      saveState();
      renderCurrentView();
      fireConfetti();
      showToast('Пропуск джуниора получен! Открыт доступ к уровню «Мидл».', 'wrench');
    }
  }

  /* ---------------- УРОВЕНЬ 3 ---------------- */

  function level3RequiredFields() {
    const def = course().level3;
    return [def.prompts[0].id, def.prompts[1].id, ...def.reflection.questions.map(q => q.id)];
  }

  function renderLevel3() {
    const def = course().level3;
    const cs = courseState().level3;

    const promptsHtml = def.prompts.map(p => {
      const value = cs.prompts[p.id] || '';
      const rubricState = cs.prompts['_rubric_' + p.id] || {};
      const rubricHtml = p.rubric.map((r, ri) => `
        <li class="${rubricState[ri] ? 'checked' : ''}">
          <input type="checkbox" data-action="rubric-toggle" data-prompt-id="${p.id}" data-rubric-idx="${ri}" ${rubricState[ri] ? 'checked' : ''} id="rubric-${p.id}-${ri}">
          <label for="rubric-${p.id}-${ri}">${escapeHtml(r)}</label>
        </li>`).join('');
      return `
        <article class="prompt-card glass">
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.taskText)}</p>
          <label class="field-label" for="prompt-${p.id}">Ваш промпт для ИИ-ассистента</label>
          <textarea class="text-input code-editor" style="font-family:var(--font-sans); min-height:130px;" id="prompt-${p.id}"
            data-action="prompt-input" data-prompt-id="${p.id}"
            placeholder="${escapeHtml(p.placeholder)}">${escapeHtml(value)}</textarea>
          <p class="field-label" style="margin-top:1rem;">Самопроверка — отметьте, что вы учли (это не влияет на автооценку, только помогает себе проверить):</p>
          <ul class="rubric-list">${rubricHtml}</ul>
        </article>`;
    }).join('');

    const reflectionHtml = def.reflection.questions.map(q => {
      const value = cs.reflection[q.id] || '';
      return `
        <div class="reflection-q">
          <label for="refl-${q.id}">${escapeHtml(q.label)}</label>
          <textarea class="text-input" id="refl-${q.id}" data-action="reflection-input" data-refl-id="${q.id}" placeholder="Ваш ответ...">${escapeHtml(value)}</textarea>
        </div>`;
    }).join('');

    const requiredFields = level3RequiredFields();
    const filledCount = requiredFields.filter(id => {
      const val = (cs.prompts[id] || cs.reflection[id] || '').trim();
      return val.length >= 10;
    }).length;
    const readyToSubmit = filledCount === requiredFields.length;

    const banner = cs.submitted ? `
      <div class="level-complete-banner glass">
        ${icon('brain', 'icon-lg')}
        <h2>Пропуск мидла получен!</h2>
        <p>Файл с ответами выгружен — передайте его преподавателю для экспертной проверки.</p>
      </div>` : '';

    return `
      <section class="view-header">
        <span class="view-eyebrow">${escapeHtml(course().meta.dept)} · Уровень допуска 03</span>
        <h1>Мидл — ${escapeHtml(def.subtitle)}</h1>
        <p>Здесь нет автоматической проверки «правильно/неправильно» — задания оценивает преподаватель. Заполните оба промпта и рефлексию, затем выгрузите файл для сдачи.</p>
      </section>
      ${promptsHtml}
      <div class="section-divider">${escapeHtml(def.reflection.title)}</div>
      <div class="reflection-card glass">${reflectionHtml}</div>

      <div class="export-bar">
        <button type="button" class="btn btn-primary" data-action="export-level3" ${readyToSubmit ? '' : 'disabled'}>${icon('download')} Скачать ответ для преподавателя</button>
        <span class="export-status">${readyToSubmit ? 'Все поля заполнены — можно выгружать.' : `Заполнено ${filledCount} из ${requiredFields.length} полей (минимум 10 символов в каждом).`}</span>
      </div>
      ${banner}
    `;
  }

  function updateLevel3ExportStatus() {
    const cs = courseState().level3;
    const requiredFields = level3RequiredFields();
    const filledCount = requiredFields.filter(id => {
      const val = (cs.prompts[id] || cs.reflection[id] || '').trim();
      return val.length >= 10;
    }).length;
    const readyToSubmit = filledCount === requiredFields.length;
    const btn = document.querySelector('[data-action="export-level3"]');
    const status = document.querySelector('.export-status');
    if (btn) btn.disabled = !readyToSubmit;
    if (status) status.textContent = readyToSubmit
      ? 'Все поля заполнены — можно выгружать.'
      : `Заполнено ${filledCount} из ${requiredFields.length} полей (минимум 10 символов в каждом).`;
  }

  function handlePromptInput(promptId, value) {
    courseState().level3.prompts[promptId] = value;
    saveState();
    updateLevel3ExportStatus();
  }

  function handleReflectionInput(reflId, value) {
    courseState().level3.reflection[reflId] = value;
    saveState();
    updateLevel3ExportStatus();
  }

  function handleRubricToggle(promptId, idx) {
    const prompts = courseState().level3.prompts;
    const key = '_rubric_' + promptId;
    if (!prompts[key]) prompts[key] = {};
    prompts[key][idx] = !prompts[key][idx];
    saveState();
    renderCurrentView();
  }

  function handleExportLevel3() {
    const def = course().level3;
    const cs = courseState();
    const name = state.name && state.name.trim() ? state.name.trim() : 'Без имени';
    const lines = [];
    lines.push('CodeCraft Inc. — отчёт стажёра');
    lines.push('Отдел: ' + course().meta.dept + ' (' + course().meta.title + ')');
    lines.push('Студент: ' + name);
    lines.push('Дата: ' + new Date().toLocaleString('ru-RU'));
    lines.push('');
    lines.push('=== Уровень 1. Стажёр ===');
    lines.push('Результат квиза: ' + cs.level1.score + ' / ' + course().level1.quiz.length);
    lines.push('');
    lines.push('=== Уровень 2. Джуниор ===');
    course().level2.cases.forEach(caseDef => {
      const cState = getCaseState(caseDef.id);
      lines.push('- ' + caseDef.title + ': ' + (cState.solved ? 'исправлено' : 'не исправлено') + ' (попыток: ' + cState.attempts + ')');
    });
    lines.push('');
    lines.push('=== Уровень 3. Мидл — промпт-инжиниринг ===');
    def.prompts.forEach(p => {
      lines.push('--- ' + p.title + ' ---');
      lines.push(cs.level3.prompts[p.id] || '(пусто)');
      const rubricState = cs.level3.prompts['_rubric_' + p.id] || {};
      lines.push('Самопроверка по рубрике:');
      p.rubric.forEach((r, ri) => {
        lines.push('  [' + (rubricState[ri] ? 'x' : ' ') + '] ' + r);
      });
      lines.push('');
    });
    lines.push('=== ' + def.reflection.title + ' ===');
    def.reflection.questions.forEach(q => {
      lines.push('Вопрос: ' + q.label);
      lines.push('Ответ: ' + (cs.level3.reflection[q.id] || '(пусто)'));
      lines.push('');
    });

    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile('codecraft-' + course().meta.id + '-report-' + stamp + '.txt', lines.join('\n'));

    if (!cs.level3.submitted) {
      cs.level3.submitted = true;
      awardBadge(state.activeCourseId, 'middle');
      saveState();
      renderCurrentView();
      fireConfetti();
      showToast('Пропуск мидла получен! Файл для преподавателя выгружен.', 'brain');
    } else {
      saveState();
    }
  }

  /* ---------------- Приветственная типографика (typewriter) ---------------- */

  function typeWriter(el, text, speed, done) {
    if (prefersReducedMotion()) {
      el.textContent = text;
      if (done) done();
      return;
    }
    let i = 0;
    el.textContent = '';
    const timer = setInterval(() => {
      el.textContent += text[i];
      i += 1;
      if (i >= text.length) {
        clearInterval(timer);
        if (done) done();
      }
    }, speed);
  }

  /* ---------------- Инициализация и обработчики ---------------- */

  function applySettings() {
    document.documentElement.style.setProperty('--font-scale', state.settings.fontScale);
    document.documentElement.dataset.contrast = state.settings.highContrast ? 'high' : 'normal';
    document.getElementById('contrast-toggle').setAttribute('aria-pressed', String(state.settings.highContrast));

    const isLight = state.settings.theme === 'light';
    document.documentElement.dataset.theme = state.settings.theme;
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.setAttribute('aria-pressed', String(isLight));
    themeBtn.setAttribute('aria-label', isLight ? 'Переключить на тёмную тему' : 'Переключить на светлую тему');
    themeBtn.innerHTML = icon(isLight ? 'sun' : 'moon');
  }

  function initHeaderControls() {
    document.getElementById('font-dec').addEventListener('click', () => {
      state.settings.fontScale = Math.max(0.85, Math.round((state.settings.fontScale - 0.1) * 100) / 100);
      saveState(); applySettings();
    });
    document.getElementById('font-inc').addEventListener('click', () => {
      state.settings.fontScale = Math.min(1.4, Math.round((state.settings.fontScale + 0.1) * 100) / 100);
      saveState(); applySettings();
    });
    document.getElementById('contrast-toggle').addEventListener('click', () => {
      state.settings.highContrast = !state.settings.highContrast;
      saveState(); applySettings();
    });
    document.getElementById('theme-toggle').addEventListener('click', () => {
      state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
      saveState(); applySettings();
    });
    document.getElementById('badge-card-btn').addEventListener('click', () => openModal('badge-overlay'));
    document.getElementById('badge-close-btn').addEventListener('click', () => closeModal('badge-overlay'));
    document.getElementById('badge-overlay').addEventListener('click', e => {
      if (e.target.id === 'badge-overlay') closeModal('badge-overlay');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal('badge-overlay');
    });
    document.getElementById('hub-nav-btn').addEventListener('click', goToHub);
    document.getElementById('brand-mark-btn').addEventListener('click', goToHub);

    document.querySelectorAll('.level-tab').forEach(tab => {
      tab.addEventListener('click', () => goToView(Number(tab.dataset.level)));
    });
  }

  function openModal(id) {
    document.getElementById(id).classList.add('is-open');
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('is-open');
  }

  function initIntroModal() {
    const overlay = document.getElementById('intro-overlay');
    const nameInput = document.getElementById('intro-name');
    nameInput.value = state.name || '';

    const introSeen = sessionStorage.getItem('codecraft.introSeen');
    if (!introSeen) {
      openModal('intro-overlay');
      typeWriter(document.getElementById('intro-typewriter'), 'инициализация пропуска… доступ в бизнес-центр выдан.', 35);
    }

    document.getElementById('intro-start-btn').addEventListener('click', () => {
      state.name = nameInput.value.trim();
      saveState();
      sessionStorage.setItem('codecraft.introSeen', '1');
      closeModal('intro-overlay');
      document.getElementById('view-root').focus({ preventScroll: true });
    });
  }

  function initDelegatedEvents() {
    const root = document.getElementById('view-root');

    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'enter-course') enterCourse(btn.dataset.courseId);
      else if (action === 'quiz-check') checkQuizAnswer(btn.dataset.qid);
      else if (action === 'quiz-retry') retryQuiz();
      else if (action === 'goto-level') goToView(Number(btn.dataset.level));
      else if (action === 'case-check') handleCaseCheck(btn.dataset.caseId);
      else if (action === 'case-reset') handleCaseReset(btn.dataset.caseId);
      else if (action === 'export-level3') handleExportLevel3();
    });

    root.addEventListener('change', e => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'quiz-select') handleQuizSelect(el.dataset.qid, el.dataset.qtype, el.value);
      else if (action === 'rubric-toggle') handleRubricToggle(el.dataset.promptId, el.dataset.rubricIdx);
    });

    root.addEventListener('input', e => {
      const codeEditor = e.target.closest('textarea.code-editor[data-case-id]');
      if (codeEditor) {
        getCaseState(codeEditor.dataset.caseId).code = codeEditor.value;
        saveState();
        return;
      }
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      if (action === 'prompt-input') handlePromptInput(el.dataset.promptId, el.value);
      else if (action === 'reflection-input') handleReflectionInput(el.dataset.reflId, el.value);
    });
  }

  function init() {
    applySettings();
    initHeaderControls();
    initIntroModal();
    initDelegatedEvents();
    renderCurrentView();
    updateHeaderWidgets();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
