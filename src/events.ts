import type { Client, Interaction, Message } from 'discord.js';
import { Events, MessageFlags } from 'discord.js';

import { reviveBindResult } from './bind-result';
import type { InternalClient } from './client';
import { dispatchCommand } from './command-dispatcher';
import { MessageCommandInvocation, SlashCommandInvocation } from './command-invocation';
import { componentThrottle } from './command-throttle';
import { publishBindOutcome } from './commands/bind-outcome';
import { PacksCommands } from './commands/packs.commands';
import { PACKS_CUSTOM_ID } from './commands/packs.presenter';
import { makeTranslator, resolveLocale } from './i18n/i18n.service';
import type { GuildConfigView } from './interfaces';
import { contextualLogger, runWithLogContext, updateLogContext } from './observability/context';
import { interactionDiscordContext, messageDiscordContext } from './observability/discord-context';
import { parseSlashCommand } from './slash-command-catalog';
import { parseCommand } from './utils/parser.util';

const FALLBACK_ERROR_EMOJI = '❌';
const BANNED_MESSAGE = '🚫 Você está banido e não pode usar o bot.';
const BIND_CUSTOM_ID = 'bind';

/** Botões tratados aqui: vínculo de carta (legado) e packs. */
function isHandledButton(customId: string): boolean {
  if (customId === BIND_CUSTOM_ID || customId.startsWith(`${BIND_CUSTOM_ID}:`)) return true;
  return customId.startsWith(`${PACKS_CUSTOM_ID}:`);
}

export function registerEvents(client: Client, api: InternalClient): void {
  const packs = new PacksCommands(api);
  client.on(Events.MessageCreate, (m) => void onMessageCreate(api, m));
  client.on(Events.InteractionCreate, (i) => void onInteractionCreate(api, packs, i));
}

async function onMessageCreate(api: InternalClient, message: Message): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;
  await runWithLogContext(
    {
      requestId: `discord-${message.id}`,
      source: 'message',
      event: Events.MessageCreate,
      guildId: message.guildId,
      channelId: message.channelId,
      discordUserId: message.author.id,
      discord: messageDiscordContext(message),
    },
    () => handleMessageCreate(api, message),
  );
}

async function handleMessageCreate(api: InternalClient, message: Message<true>): Promise<void> {
  const log = contextualLogger();
  try {
    const config = await api.post<GuildConfigView>('/internal/v1/guilds/ensure', {
      guildId: message.guildId,
    });
    const parsed = parseCommand(message.content, config.prefix);
    log.debug(
      {
        configuredPrefix: config.prefix,
        prefixMatched: parsed !== null,
        contentLength: message.content.length,
      },
      'message evaluated',
    );
    if (!parsed) return;
    await dispatchCommand(api, new MessageCommandInvocation(message), parsed, config);
  } catch (err) {
    log.error({ err, phase: 'message-event' }, 'message handling failed');
    await message.reply(FALLBACK_ERROR_EMOJI).catch(() => undefined);
  }
}

async function onInteractionCreate(api: InternalClient, packs: PacksCommands, interaction: Interaction): Promise<void> {
  const source = interaction.isChatInputCommand() ? 'slash' : 'component';
  await runWithLogContext(
    {
      requestId: `discord-${interaction.id}`,
      source,
      event: Events.InteractionCreate,
      guildId: interaction.guildId ?? undefined,
      channelId: interaction.channelId ?? undefined,
      discordUserId: interaction.user.id,
      discord: interactionDiscordContext(interaction),
    },
    () => handleInteractionCreate(api, packs, interaction),
  );
}

async function handleInteractionCreate(api: InternalClient, packs: PacksCommands, interaction: Interaction): Promise<void> {
  const log = contextualLogger();
  if (interaction.isChatInputCommand()) {
    try {
      if (!interaction.inCachedGuild()) {
        await interaction.reply({ content: FALLBACK_ERROR_EMOJI, flags: MessageFlags.Ephemeral });
        return;
      }
      const resolved = parseSlashCommand(interaction);
      if (!resolved) {
        await interaction.reply({ content: FALLBACK_ERROR_EMOJI, flags: MessageFlags.Ephemeral });
        return;
      }
      const invocation = new SlashCommandInvocation(interaction);
      if (resolved.route.defer !== false) await invocation.defer(resolved.route.ephemeral);
      await dispatchCommand(api, invocation, resolved.parsed);
    } catch (err) {
      log.error({ err, phase: 'slash-event' }, 'interaction handling failed');
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: FALLBACK_ERROR_EMOJI }).catch(() => undefined);
      } else {
        await interaction.reply({ content: FALLBACK_ERROR_EMOJI, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
    return;
  }
  if (!interaction.isButton() || !interaction.guildId) return;
  if (!isHandledButton(interaction.customId)) return;
  const verdict = componentThrottle.take(interaction.user.id);
  if (verdict !== 'ok') {
    if (verdict === 'warn') log.warn({ event: 'component_throttled' }, 'user throttled');
    await interaction.reply({ content: '⏳', flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }
  try {
    const user = await api.post<{ isBanned: boolean; locale: 'en' | 'pt' | 'ja' | 'es' | null }>(
      '/internal/v1/users/ensure',
      { discordId: interaction.user.id, username: interaction.user.username },
    );
    if (user.isBanned) {
      await interaction.reply({ content: BANNED_MESSAGE, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildConfig = await api.post<
      Pick<GuildConfigView, 'prefix' | 'defaultLocale' | 'scopeMode' | 'rollIntervalMinutes'>
    >('/internal/v1/guilds/ensure', { guildId: interaction.guildId });
    const locale = resolveLocale(user.locale, guildConfig.defaultLocale);
    updateLogContext({ locale });
    const t = makeTranslator(locale, { prefix: guildConfig.prefix });
    if (!guildConfig.scopeMode) {
      await interaction.editReply({ content: t('error.GUILD_NOT_CONFIGURED', { prefix: guildConfig.prefix }) });
      return;
    }
    if (interaction.customId.startsWith(`${PACKS_CUSTOM_ID}:`)) {
      const actor = {
        discordId: interaction.user.id,
        username: interaction.user.username,
        guildId: interaction.guildId,
        guildConfig,
      };
      await packs.handleComponent(interaction, actor, t);
      return;
    }
    const [, characterIdRaw, summonerId, summonedAtRaw] = interaction.customId.split(':');
    const characterId = Number(characterIdRaw);
    const summonedAtMs = summonedAtRaw ? Number(summonedAtRaw) : undefined;
    const raw = await api.call<Record<string, unknown>, Record<string, unknown>>('/internal/v1/gacha/bind', {
      discordId: interaction.user.id,
      username: interaction.user.username,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      characterId: Number.isInteger(characterId) ? characterId : undefined,
      summonerId,
      summonedAtMs,
    });
    await publishBindOutcome(reviveBindResult(raw), interaction, api, t);
  } catch (err) {
    log.error({ err, phase: 'component-event', customId: interaction.customId }, 'interaction handling failed');
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: FALLBACK_ERROR_EMOJI }).catch(() => undefined);
    } else {
      await interaction.reply({ content: FALLBACK_ERROR_EMOJI, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
}
