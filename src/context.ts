import type { InternalClient } from './client';
import type { CommandInvocation } from './command-invocation';
import { makeTranslator, resolveLocale } from './i18n/i18n.service';
import type { BotUser, CommandContext, GuildConfigView, Locale } from './interfaces';
import type { ParsedCommand } from './utils/parser.util';

export async function buildContext(
  api: InternalClient,
  invocation: CommandInvocation,
  parsed: ParsedCommand,
): Promise<CommandContext> {
  const guildId = invocation.guildId;
  const [guildConfig, user] = await Promise.all([
    api.post<GuildConfigView>('/internal/v1/guilds/ensure', { guildId }),
    // Com o guildId, a carteira (coins) vem do escopo deste servidor.
    api.post<BotUser>('/internal/v1/users/ensure', {
      discordId: invocation.author.id,
      username: invocation.author.username,
      guildId,
    }),
  ]);
  const locale = resolveLocale(user.locale, guildConfig.defaultLocale);
  return {
    invocation,
    args: parsed.args,
    flags: parsed.flags,
    user: { ...user, discordId: user.discordId || invocation.author.id },
    guildConfig,
    locale,
    t: makeTranslator(locale, { prefix: guildConfig.prefix }),
  };
}
