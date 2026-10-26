import en, { type Translation } from './en';
import pt from './pt';

export const translations = { en, pt } as const;
export type Language = keyof typeof translations;
export { type Translation } from './en';

export function getTranslation(language: Language): Translation {
  return translations[language];
}
