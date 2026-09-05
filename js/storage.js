/* ============================================================
   Локальное хранилище прогресса (localStorage).
   Никаких сетевых запросов — всё живёт в браузере студента.
   ============================================================ */

const STORAGE_KEY = 'codecraft.progress.v1';

const DEFAULT_STATE = {
  name: '',
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
    prompts: {},          // promptId -> text
    reflection: {},        // questionId -> text
    submitted: false
  },
  settings: {
    fontScale: 1,
    highContrast: false
  }
};

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
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_STATE, parsed);
    } catch (e) {
      console.warn('Не удалось прочитать прогресс, используем значения по умолчанию.', e);
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
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
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
};
