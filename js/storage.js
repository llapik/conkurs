/* ============================================================
   Локальное хранилище прогресса (localStorage).
   Никаких сетевых запросов — всё живёт в браузере студента.
   Прогресс/бейджи хранятся отдельно по каждому «отделу» (курсу),
   имя, тема и настройки доступности — общие на всю платформу.
   ============================================================ */

const STORAGE_KEY = 'codecraft.progress.v2';

function defaultCourseState() {
  return {
    currentLevel: 1,
    accessLevel: 1,       // 1 = Стажёр, 2 = Джуниор, 3 = Мидл
    badges: [],            // ['intern', 'junior', 'middle']
    level1: {
      answers: {},         // questionId -> [selected indices]
      checked: {},         // questionId -> boolean (вопрос уже проверен/заблокирован)
      correct: {},         // questionId -> boolean (ответ был верным)
      completed: false,
      score: 0
    },
    level2: {
      cases: {},           // caseId -> { solved: bool, code: string, attempts: number }
      completed: false
    },
    level3: {
      prompts: {},          // promptId -> text (и _rubric_<promptId> -> {idx: bool})
      reflection: {},        // questionId -> text
      submitted: false
    }
  };
}

function defaultState() {
  const courses = {};
  COURSE_ORDER.forEach(id => { courses[id] = defaultCourseState(); });
  return {
    name: '',
    activeCourseId: null,
    courses,
    settings: {
      fontScale: 1,
      highContrast: false,
      theme: 'dark'
    }
  };
}

function deepMerge(base, override) {
  const result = Array.isArray(base) ? [...base] : { ...base };
  for (const key in override) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key]) && base[key]) {
      result[key] = deepMerge(base[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return deepMerge(defaultState(), parsed);
    } catch (e) {
      console.warn('Не удалось прочитать прогресс, используем значения по умолчанию.', e);
      return defaultState();
    }
  },

  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Не удалось сохранить прогресс локально.', e);
    }
  },

  reset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    return defaultState();
  }
};
