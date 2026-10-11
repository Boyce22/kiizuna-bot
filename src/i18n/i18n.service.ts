import type { Locale, TranslateFn } from '../interfaces';

import { en } from './locales/en';
import { es } from './locales/es';
import { ja } from './locales/ja';
import { pt } from './locales/pt';

const LOCALES = { en, pt, ja, es } as const;
export const SUPPORTED_LOCALES: Locale[] = ['en', 'pt', 'ja', 'es'];
const FALLBACK: Locale = (process.env.DEFAULT_LOCALE as Locale) || 'en';

// Busca uma chave "a.b.c" em uma árvore de objeto.
function lookup(tree: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, tree);
  return typeof value === 'string' ? value : undefined;
}

// Interpola {vars} numa string.
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

// Traduz uma chave para um locale, com fallback para `en`.
export function translate(
  key: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const tree = LOCALES[locale] ?? LOCALES[FALLBACK];
  const value = lookup(tree, key) ?? lookup(LOCALES[FALLBACK], key) ?? key;
  return interpolate(value, vars);
}

// Cria uma função `t` vinculada a um locale (injetada no CommandContext).
export function makeTranslator(locale: Locale): TranslateFn {
  return (key, vars) => translate(key, locale, vars);
}

// Resolve o locale efetivo: User.locale → GuildConfig.defaultLocale → fallback.
export function resolveLocale(userLocale?: Locale | null, guildLocale?: Locale | null): Locale {
  return userLocale ?? guildLocale ?? FALLBACK;
}
