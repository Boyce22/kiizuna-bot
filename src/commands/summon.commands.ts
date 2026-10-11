import { buildCharacterEmbed, checkNsfwPermission, discordRelative, readFlag } from '@utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Message } from 'discord.js';

import { reviveBindResult } from '../bind-result';
import type { InternalClient } from '../client';
import { awaitSelection } from '../discord/selection';
import type { Command, CommandContext, TranslateFn } from '../interfaces';

import { renderBindResult } from './bind.presenter';
import { renderThiefMessages } from './thief.presenter';
import { applyThiefEvent } from './thief-role.util';

const TARGET_FLAGS = new Set(['alvo', 'target', 'objetivo']);

const TYPE_ALIASES: Record<string, 'waifu' | 'husbando' | 'all'> = {
  w: 'waifu',
  waifu: 'waifu',
  h: 'husbando',
  husbando: 'husbando',
  a: 'all',
  all: 'all',
};

type SummonOk = {
  ok: true;
  character: {
    id: number;
    name: string;
    series: string | null;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
    type: string;
    isNsfw: boolean;
    imageUrl: string | null;
  };
  effects: {
    wishlistPings?: { discordIds: string[]; name: string; series?: string; kind: 'character' | 'anime' }[];
  };
};

type SummonFail = {
  ok: false;
  reason: 'no_rolls' | 'empty_pool' | 'target_unavailable' | 'target_not_found' | 'cooldown';
  resetAt?: string | null;
};

/**
 * Handlers do fluxo summon → bind. Só I/O do Discord — roll/claim na API interna.
 */
export class SummonCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      {
        name: 'summon',
        aliases: ['s'],
        descriptionKey: 'command.summon.description',
        execute: this.handleSummon,
      },
      {
        name: 'bind',
        aliases: ['b'],
        descriptionKey: 'command.bind.description',
        execute: this.handleBind,
      },
    ];
  }

  private handleSummon = async (ctx: CommandContext): Promise<void> => {
    const { message, args, flags, user, guildConfig, t } = ctx;

    const typeArg = (args[0] ?? '').toLowerCase();
    const type = TYPE_ALIASES[typeArg];
    if (!type) {
      await message.reply(t('error.missing_args', { usage: t('summon.usage') }));
      return;
    }

    const nsfwFlag = flags.nsfw === true;
    const nsfwCheck = checkNsfwPermission(message.channel, nsfwFlag);
    if (nsfwFlag && !nsfwCheck.allowed) {
      await message.reply(t(nsfwCheck.reasonKey ?? 'error.nsfw_channel'));
      return;
    }
    const wantNsfw = nsfwFlag && nsfwCheck.allowed;

    let targetSeries: string | undefined;
    const targetArg = readFlag(flags, TARGET_FLAGS);
    if (targetArg) {
      const resolved = await this.resolveTargetSeries(message, targetArg, t);
      if (resolved === undefined) return;
      targetSeries = resolved;
    }

    const result = await this.api.post<SummonOk | SummonFail>('/internal/v1/gacha/summon', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
      channelId: message.channelId,
      type,
      nsfw: wantNsfw,
      targetSeries,
      rollIntervalMinutes: guildConfig.rollIntervalMinutes,
    });

    if (!result.ok) {
      if (result.reason === 'no_rolls') {
        await message.reply(
          t('summon.no_rolls', { time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—' }),
        );
        return;
      }
      if (result.reason === 'target_unavailable') {
        await message.reply(
          t('summon.target_unavailable', {
            time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—',
          }),
        );
        return;
      }
      if (result.reason === 'cooldown') {
        const wait = result.resetAt ? Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000)) : 1;
        await message.reply(t('error.cooldown', { seconds: wait }));
        return;
      }
      await message.reply(t('error.generic'));
      return;
    }

    const embed = buildCharacterEmbed(result.character, result.character.imageUrl, t);
    const bindButton = new ButtonBuilder()
      .setCustomId(`bind:${result.character.id}:${user.discordId}:${Date.now()}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(t('summon.bind_button'));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(bindButton);
    await message.reply({ embeds: [embed], components: [row] });

    for (const ping of result.effects.wishlistPings ?? []) {
      if (!message.channel.isSendable() || ping.discordIds.length === 0) continue;
      const key = ping.kind === 'anime' ? 'summon.anime_wishlist_ping' : 'summon.wishlist_ping';
      await message.channel.send({
        content: t(key, {
          users: ping.discordIds.map((id) => `<@${id}>`).join(' '),
          name: ping.name,
          series: ping.series ?? '',
        }),
        allowedMentions: { users: ping.discordIds },
      });
    }
  };

  private async resolveTargetSeries(
    message: Message,
    query: string,
    t: TranslateFn,
  ): Promise<string | undefined> {
    const { matches } = await this.api.post<{ matches: string[] }>('/internal/v1/gacha/series', { query });
    if (matches.length === 0) {
      await message.reply(t('summon.target_not_found', { series: query }));
      return undefined;
    }
    if (matches.length === 1) return matches[0];

    const outcome = await awaitSelection({
      message,
      content: t('summon.target_pick_prompt'),
      placeholder: t('summon.target_pick_placeholder'),
      options: matches.map((series) => ({ label: series, value: series })),
      authorizedUserId: message.author.id,
      timeoutMs: 60_000,
      idPrefix: 'summon_target_pick',
    });

    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('summon.target_pick_timeout'), components: [] }).catch(() => undefined);
      return undefined;
    }

    await outcome.interaction.update({
      content: t('summon.target_pick_chosen', { series: outcome.value }),
      components: [],
    });
    return outcome.value;
  }

  private handleBind = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    if (!message.guildId) return;

    const raw = await this.api.post<Record<string, unknown>>('/internal/v1/gacha/bind', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
      channelId: message.channelId,
    });
    const result = reviveBindResult(raw);

    const { content, announce, announceMentions } = renderBindResult(result, t);
    await message.reply(content);
    if (announce && message.channel.isSendable()) {
      await message.channel.send({
        content: announce,
        allowedMentions: { users: announceMentions ?? [] },
      });
    }

    await this.publishThiefEvent(result, message, t);
  };

  private async publishThiefEvent(
    result: ReturnType<typeof reviveBindResult>,
    message: Message,
    t: TranslateFn,
  ): Promise<void> {
    if (!result.ok || result.kind !== 'claim' || !result.thiefEvent || !message.guild) return;

    await applyThiefEvent(message.guild, this.api, result.thiefEvent, t);

    const thiefMessages = renderThiefMessages(result.thiefEvent, result.binderId, result.summonerId, result.name, t);
    for (const msg of thiefMessages) {
      if (message.channel.isSendable()) {
        await message.channel.send({ content: msg.content, allowedMentions: { users: msg.mentions } });
      }
    }
  }
}
