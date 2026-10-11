import type { Client, Interaction, Message } from 'discord.js';
import { Events, MessageFlags } from 'discord.js';

import { reviveBindResult } from './bind-result';
import { type InternalClient, InternalApiError } from './client';
import { commandRegistry } from './command-registry';
import { applyThiefEvent } from './commands/thief-role.util';
import { renderBindResult } from './commands/bind.presenter';
import { renderThiefMessages } from './commands/thief.presenter';
import { buildContext } from './context';
import { makeTranslator, resolveLocale } from './i18n/i18n.service';
import { parseCommand } from './utils/parser.util';

const FALLBACK_ERROR_EMOJI = '❌';
const BANNED_MESSAGE = '🚫 Você está banido e não pode usar o bot.';
const BIND_CUSTOM_ID = 'bind';

export function registerEvents(client: Client, api: InternalClient): void {
  client.on(Events.MessageCreate, (m) => void onMessageCreate(api, m));
  client.on(Events.InteractionCreate, (i) => void onInteractionCreate(api, i));
}

async function onMessageCreate(api: InternalClient, message: Message): Promise<void> {
  if (message.author.bot || !message.guildId) return;
  const config = await api.post<{
    prefix: string;
    defaultLocale: 'en' | 'pt' | 'ja' | 'es';
    allowedChannelIds: string[];
    scopeMode: 'guild' | 'global' | null;
  }>('/internal/v1/guilds/ensure', { guildId: message.guildId });
  const parsed = parseCommand(message.content, config.prefix);
  if (!parsed) return;
  const command = commandRegistry.get(parsed.name);
  if (!command) return;

  if (
    !command.bypassChannelRestriction &&
    config.allowedChannelIds.length > 0 &&
    !config.allowedChannelIds.includes(message.channelId)
  ) {
    const t = makeTranslator(resolveLocale(null, config.defaultLocale));
    const channels = config.allowedChannelIds.map((id) => `<#${id}>`).join(', ');
    const reply = await message.reply(t('error.wrong_channel', { channels })).catch(() => null);
    await message.delete().catch(() => undefined);
    if (reply) setTimeout(() => reply.delete().catch(() => undefined), 5_000);
    return;
  }

  // Servidor novo: só setup/ajuda/idioma até um admin escolher o modo de jogo.
  if (!config.scopeMode && !command.availableBeforeSetup) {
    const t = makeTranslator(resolveLocale(null, config.defaultLocale));
    await message.reply(t('error.guild_not_configured', { prefix: config.prefix })).catch(() => undefined);
    return;
  }

  try {
    const ctx = await buildContext(api, message, parsed);
    if (ctx.user.isBanned) {
      if (message.channel.isSendable()) await message.reply(BANNED_MESSAGE);
      return;
    }
    await command.execute(ctx);
  } catch (err) {
    if (isGuildNotConfigured(err)) {
      const t = makeTranslator(resolveLocale(null, config.defaultLocale));
      await message.reply(t('error.guild_not_configured', { prefix: config.prefix })).catch(() => undefined);
      return;
    }
    console.error(err);
    if (message.channel.isSendable()) {
      await message.reply(FALLBACK_ERROR_EMOJI).catch(() => undefined);
    }
  }
}

/** A API recusou o comando porque o servidor ainda não escolheu o modo de jogo. */
function isGuildNotConfigured(err: unknown): boolean {
  return err instanceof InternalApiError && err.code === 'guild_not_configured';
}

async function onInteractionCreate(api: InternalClient, interaction: Interaction): Promise<void> {
  if (!interaction.isButton() || !interaction.guildId) return;
  if (interaction.customId !== BIND_CUSTOM_ID && !interaction.customId.startsWith(`${BIND_CUSTOM_ID}:`)) return;
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
    const guildConfig = await api.post<{
      prefix: string;
      defaultLocale: 'en' | 'pt' | 'ja' | 'es';
      scopeMode: 'guild' | 'global' | null;
    }>(
      '/internal/v1/guilds/ensure',
      { guildId: interaction.guildId },
    );
    const t = makeTranslator(resolveLocale(user.locale, guildConfig.defaultLocale));
    if (!guildConfig.scopeMode) {
      await interaction.editReply({ content: t('error.guild_not_configured', { prefix: guildConfig.prefix }) });
      return;
    }
    const [, characterIdRaw, summonerId, summonedAtRaw] = interaction.customId.split(':');
    const characterId = Number(characterIdRaw);
    const summonedAtMs = summonedAtRaw ? Number(summonedAtRaw) : undefined;
    const raw = await api.post<Record<string, unknown>>('/internal/v1/gacha/bind', {
      discordId: interaction.user.id,
      username: interaction.user.username,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      characterId: Number.isInteger(characterId) ? characterId : undefined,
      summonerId,
      summonedAtMs,
    });
    const result = reviveBindResult(raw);
    const { content, announce, announceMentions } = renderBindResult(result, t);
    await interaction.editReply({ content });
    if (announce && interaction.channel?.isSendable()) {
      await interaction.channel.send({
        content: announce,
        allowedMentions: { users: announceMentions ?? [] },
      });
    }
    if (result.ok && result.kind === 'claim' && result.thiefEvent && interaction.guild) {
      await applyThiefEvent(interaction.guild, api, result.thiefEvent, t);
      const thiefMessages = renderThiefMessages(
        result.thiefEvent,
        result.binderId,
        result.summonerId,
        result.name,
        t,
      );
      for (const msg of thiefMessages) {
        if (interaction.channel?.isSendable()) {
          await interaction.channel.send({ content: msg.content, allowedMentions: { users: msg.mentions } });
        }
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: FALLBACK_ERROR_EMOJI }).catch(() => undefined);
    } else {
      await interaction.reply({ content: FALLBACK_ERROR_EMOJI, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  }
}
