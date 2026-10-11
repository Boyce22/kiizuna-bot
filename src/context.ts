import type { Message } from 'discord.js';

import type { InternalClient } from './client';
import { makeTranslator, resolveLocale } from './i18n/i18n.service';
import type { BotUser, CommandContext, GuildConfigView, Locale } from './interfaces';
import type { ParsedCommand } from './utils/parser.util';

export async function buildContext(
  api: InternalClient,
  message: Message,
  parsed: ParsedCommand,
): Promise<CommandContext> {
  const guildId = message.guildId!;
  const [guildConfig, user] = await Promise.all([
    api.post<GuildConfigView>('/internal/v1/guilds/ensure', { guildId }),
    // Com o guildId, a carteira (coins) vem do escopo deste servidor.
    api.post<BotUser>('/internal/v1/users/ensure', {
      discordId: message.author.id,
      username: message.author.username,
      guildId,
    }),
  ]);
  const locale = resolveLocale(user.locale, guildConfig.defaultLocale);
  return {
    message,
    args: parsed.args,
    flags: parsed.flags,
    user: { ...user, discordId: user.discordId || message.author.id },
    guildConfig,
    locale,
    t: makeTranslator(locale),
  };
}
