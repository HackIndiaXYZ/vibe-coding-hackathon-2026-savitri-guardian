import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Lightweight i18n + a11y scaffold.
 * - `t(key, fallback)` returns the localized string (English-only today, but
 *   every UI label flows through here so future locales drop in).
 * - `useSpeak()` returns a function that speaks text via the Web Speech API
 *   (TTS scaffolding). Honors the current `silent` flag.
 * - Future STT can hook in the same way (see `useListen` placeholder).
 */

export type Lang = "en";

type Dict = Record<string, string>;
const dictionaries: Record<Lang, Dict> = { en: {} };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  silent: boolean;
  setSilent: (s: boolean) => void;
};
const I18nCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, silent: false, setSilent: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const [silent, setSilent] = useState(false);
  const value = useMemo(() => ({ lang, setLang, silent, setSilent }), [lang, silent]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() { return useContext(I18nCtx); }

export function t(key: string, fallback: string, lang: Lang = "en"): string {
  return dictionaries[lang]?.[key] ?? fallback;
}

/** Speak text aloud via Web Speech API. No-op if silent mode or unsupported. */
export function useSpeak() {
  const { silent } = useI18n();
  return useCallback((text: string) => {
    if (silent) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* noop */ }
  }, [silent]);
}

/** Haptic vibration helper, no-op when unsupported or in silent-visual-only mode. */
export function haptic(pattern: number | number[] = 30) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try { navigator.vibrate(pattern); } catch { /* noop */ }
}
