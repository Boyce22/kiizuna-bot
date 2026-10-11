import type { CommandInvocation } from './command-invocation';

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export type Locale = 'en' | 'pt' | 'ja' | 'es';

export interface BotUser {
  id: string;
  discordId: string;
  username: string;
  coins: number;
  locale: Locale | null;
  isBanned: boolean;
  globalRank: number;
}

export type ScopeMode = 'guild' | 'global';

export interface GuildConfigView {
  guildId: string;
  /** null = servidor ainda não escolheu o modo de jogo (comandos de jogo ficam bloqueados). */
  scopeMode: ScopeMode | null;
  prefix: string;
  defaultLocale: Locale;
  rollIntervalMinutes: number;
  allowedChannelIds: string[];
  allowedTypes: string[];
  rollChannelId: string | null;
}

export interface CommandContext {
  /** Entrada normalizada para mensagens com prefixo e interações nativas. */
  invocation: CommandInvocation;
  args: string[];
  flags: Record<string, string | boolean>;
  user: BotUser;
  guildConfig: GuildConfigView;
  locale: Locale;
  t: TranslateFn;
}

export interface CommandExecutor {
  name: string;
  execute(ctx: CommandContext): Promise<void> | void;
}

export interface Command extends CommandExecutor {
  aliases?: string[];
  descriptionKey: string;
  bypassChannelRestriction?: boolean;
  /** Funciona antes do servidor escolher o modo de jogo (setup, ajuda, idioma). */
  availableBeforeSetup?: boolean;
}
