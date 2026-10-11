import type { Rarity } from '@config';
import { buildCharacterEmbed, checkNsfwPermission, discordRelative } from '@utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

type RerollOk = {
  ok: true;
  character: {
    id: number;
    name: string;
    series: string | null;
    rarity: Rarity;
    imageUrl: string | null;
  };
};

type RerollFail = {
  ok: false;
  reason: 'vip_required' | 'no_summon' | 'none_left' | 'empty_pool';
  resetAt?: string | null;
};

export class RerollCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'reroll', execute: this.handleReroll },
    ];
  }

  private handleReroll = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    const nsfw = checkNsfwPermission(invocation.channel, true).allowed;
    const result = await this.api.post<RerollOk | RerollFail>('/internal/v1/gacha/reroll', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      channelId: invocation.channelId,
      nsfw,
    });

    if (!result.ok) {
      if (result.reason === 'vip_required') {
        await invocation.reply(t('reroll.vip_required'));
        return;
      }
      if (result.reason === 'no_summon') {
        await invocation.reply(t('reroll.no_summon'));
        return;
      }
      if (result.reason === 'none_left') {
        await invocation.reply(
          t('reroll.none_left', { time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—' }),
        );
        return;
      }
      await invocation.reply(t('error.generic'));
      return;
    }

    const embed = buildCharacterEmbed(result.character, result.character.imageUrl, t);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bind:${result.character.id}:${user.discordId}:${Date.now()}`)
        .setStyle(ButtonStyle.Success)
        .setLabel(t('summon.bind_button')),
    );
    await invocation.reply({ embeds: [embed], components: [row] });
  };
}
