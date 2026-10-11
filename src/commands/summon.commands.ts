import { buildCharacterEmbed, checkNsfwPermission, discordRelative, readFlag } from '@utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { reviveBindResult } from '../bind-result';
import type { InternalClient } from '../client';
import type { CommandInvocation } from '../command-invocation';
import { awaitSelection } from '../discord/selection';
import type { CommandContext, CommandExecutor, TranslateFn } from '../interfaces';

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

  get commands(): CommandExecutor[] {
    return [
      {
        name: 'summon',
        execute: this.handleSummon,
      },
      {
        name: 'bind',
        execute: this.handleBind,
      },
    ];
  }

  private handleSummon = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, flags, user, guildConfig, t } = ctx;

    const typeArg = (args[0] ?? '').toLowerCase();
    const type = TYPE_ALIASES[typeArg];
    if (!type) {
      await invocation.reply(t('error.missing_args', { usage: t('summon.usage') }));
      return;
    }

    const nsfwFlag = flags.nsfw === true;
    const nsfwCheck = checkNsfwPermission(invocation.channel, nsfwFlag);
    if (nsfwFlag && !nsfwCheck.allowed) {
      await invocation.reply(t(nsfwCheck.reasonKey ?? 'error.nsfw_channel'));
      return;
    }
    const wantNsfw = nsfwFlag && nsfwCheck.allowed;

    let targetSeries: string | undefined;
    const targetArg = readFlag(flags, TARGET_FLAGS);
    if (targetArg) {
      const resolved = await this.resolveTargetSeries(invocation, targetArg, t);
      if (resolved === undefined) return;
      targetSeries = resolved;
    }

    const result = await this.api.post<SummonOk | SummonFail>('/internal/v1/gacha/summon', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      channelId: invocation.channelId,
      type,
      nsfw: wantNsfw,
      targetSeries,
      rollIntervalMinutes: guildConfig.rollIntervalMinutes,
    });

    if (!result.ok) {
      if (result.reason === 'no_rolls') {
        await invocation.reply(
          t('summon.no_rolls', { time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—' }),
        );
        return;
      }
      if (result.reason === 'target_unavailable') {
        await invocation.reply(
          t('summon.target_unavailable', {
            time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—',
          }),
        );
        return;
      }
      if (result.reason === 'cooldown') {
        const wait = result.resetAt ? Math.max(1, Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000)) : 1;
        await invocation.reply(t('error.cooldown', { seconds: wait }));
        return;
      }
      await invocation.reply(t('error.generic'));
      return;
    }

    const embed = buildCharacterEmbed(result.character, result.character.imageUrl, t);
    const bindButton = new ButtonBuilder()
      .setCustomId(`bind:${result.character.id}:${user.discordId}:${Date.now()}`)
      .setStyle(ButtonStyle.Success)
      .setLabel(t('summon.bind_button'));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(bindButton);
    await invocation.reply({ embeds: [embed], components: [row] });

    for (const ping of result.effects.wishlistPings ?? []) {
      if (!invocation.channel.isSendable() || ping.discordIds.length === 0) continue;
      const key = ping.kind === 'anime' ? 'summon.anime_wishlist_ping' : 'summon.wishlist_ping';
      await invocation.channel.send({
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
    invocation: CommandInvocation,
    query: string,
    t: TranslateFn,
  ): Promise<string | undefined> {
    const { matches } = await this.api.post<{ matches: string[] }>('/internal/v1/gacha/series', { query });
    if (matches.length === 0) {
      await invocation.reply(t('summon.target_not_found', { series: query }));
      return undefined;
    }
    if (matches.length === 1) return matches[0];

    const outcome = await awaitSelection({
      invocation,
      content: t('summon.target_pick_prompt'),
      placeholder: t('summon.target_pick_placeholder'),
      options: matches.map((series) => ({ label: series, value: series })),
      authorizedUserId: invocation.author.id,
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
    const { invocation, user, t } = ctx;
    if (!invocation.guildId) return;

    const raw = await this.api.post<Record<string, unknown>>('/internal/v1/gacha/bind', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      channelId: invocation.channelId,
    });
    const result = reviveBindResult(raw);

    const { content, announce, announceMentions } = renderBindResult(result, t);
    await invocation.reply(content);
    if (announce && invocation.channel.isSendable()) {
      await invocation.channel.send({
        content: announce,
        allowedMentions: { users: announceMentions ?? [] },
      });
    }

    await this.publishThiefEvent(result, invocation, t);
  };

  private async publishThiefEvent(
    result: ReturnType<typeof reviveBindResult>,
    invocation: CommandInvocation,
    t: TranslateFn,
  ): Promise<void> {
    if (!result.ok || result.kind !== 'claim' || !result.thiefEvent || !invocation.guild) return;

    await applyThiefEvent(invocation.guild, this.api, result.thiefEvent, t);

    const thiefMessages = renderThiefMessages(result.thiefEvent, result.binderId, result.summonerId, result.name, t);
    for (const msg of thiefMessages) {
      if (invocation.channel.isSendable()) {
        await invocation.channel.send({ content: msg.content, allowedMentions: { users: msg.mentions } });
      }
    }
  }
}
