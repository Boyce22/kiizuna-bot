import type { InternalClient } from '../client';
import { translate } from '../i18n/i18n.service';
import type { Command, CommandContext, Locale } from '../interfaces';

const LABELS: Record<Locale, string> = {
  en: 'English',
  pt: 'Português',
  ja: '日本語',
  es: 'Español',
};

const SUPPORTED: Locale[] = ['en', 'pt', 'ja', 'es'];

export class SettingsCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [{ name: 'language', aliases: ['lang', 'idioma'], descriptionKey: 'command.language.description', availableBeforeSetup: true, execute: this.handleLanguage }];
  }

  private handleLanguage = async (ctx: CommandContext): Promise<void> => {
    const { user, args, message, locale, t } = ctx;
    const options = SUPPORTED.map((l) => `\`${l}\` (${LABELS[l]})`).join(', ');
    const choice = (args[0] ?? '').toLowerCase() as Locale;
    if (!choice) {
      await message.reply(t('language.current', { lang: LABELS[locale], options }));
      return;
    }
    if (!SUPPORTED.includes(choice)) {
      await message.reply(t('language.invalid', { options }));
      return;
    }
    await this.api.post('/internal/v1/users/locale', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      locale: choice,
    });
    await message.reply(translate('language.changed', choice, { lang: LABELS[choice] }));
  };
}
