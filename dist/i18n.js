/** Small explicit Chinese/English catalog. Table contents are never translated. */
const catalog = new Map();
const normalizeLocale = value => String(value || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';

function initialLocale() {
  if (typeof document === 'undefined') return 'zh-CN';
  try {
    const stored = localStorage.getItem('qingshu.locale.v1');
    if (stored === 'zh-CN' || stored === 'en') return stored;
  } catch {}
  return normalizeLocale(globalThis.navigator?.language || 'zh-CN');
}

let locale = initialLocale();
export function getLocale() { return locale; }
export function setLocale(value) {
  if (!['zh-CN', 'en'].includes(value)) throw new Error('Unsupported locale: ' + value);
  locale = value;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
    try { localStorage.setItem('qingshu.locale.v1', locale); } catch {}
  }
  return locale;
}

/** Both complete messages are registered, including any inserted row or field names. */
export function tr(zh, en) {
  const pair = { 'zh-CN': String(zh), en: String(en) };
  catalog.set(pair['zh-CN'], pair);
  catalog.set(pair.en, pair);
  return pair[locale];
}

/** Re-render a previously generated UI/audit message in the selected language. */
export function localize(message, targetLocale = locale) {
  const text = String(message ?? '');
  return catalog.get(text)?.[targetLocale] ?? text;
}

export function formatNumber(value) {
  return Number(value ?? 0).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN');
}

export function formatDateTime(value, options = {}) {
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', options);
}
