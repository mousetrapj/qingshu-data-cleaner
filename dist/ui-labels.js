import { getLocale, setLocale, tr } from './i18n.js';

const TRANSLATED_ATTRIBUTES = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'content'];

/**
 * Translate explicitly marked static labels only. Imported table values,
 * input values, business state, icons, and dynamic count nodes are untouched.
 * The optional locale argument changes the interface preference only.
 */
export function translateStatic(targetLocale = getLocale(), root = globalThis.document) {
  if (targetLocale !== getLocale()) setLocale(targetLocale);
  const locale = getLocale();
  const counts = { locale, texts: 0, attributes: 0 };
  if (!root?.querySelectorAll) return counts;

  for (const element of root.querySelectorAll('[data-i18n-zh][data-i18n-en]')) {
    // A misplaced marker must never replace nested icons, inputs, or counts.
    if (element.childElementCount > 0) continue;
    element.textContent = tr(element.getAttribute('data-i18n-zh'), element.getAttribute('data-i18n-en'));
    counts.texts++;
  }

  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const chinese = `data-i18n-${attribute}-zh`;
    const english = `data-i18n-${attribute}-en`;
    for (const element of root.querySelectorAll(`[${chinese}][${english}]`)) {
      element.setAttribute(attribute, tr(element.getAttribute(chinese), element.getAttribute(english)));
      counts.attributes++;
    }
  }

  const documentElement = root.documentElement || root.ownerDocument?.documentElement;
  if (documentElement) documentElement.lang = locale;
  const languageSelect = root.querySelector?.('#locale-select');
  if (languageSelect) languageSelect.value = locale;
  return counts;
}
