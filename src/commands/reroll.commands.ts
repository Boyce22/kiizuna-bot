import { buildCharacterEmbed, checkNsfwPermission, discordRelative } from '@utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

type RerollOk = {
  ok: true;
  character: {
    id: number;
    name: string;
    series: string | null;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
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

  get commands(): Command[] {
    return [
      { name: 'reroll', aliases: ['rr'], descriptionKey: 'command.reroll.description', execute: this.handleReroll },
    ];
  }

  private handleReroll = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const nsfw = checkNsfwPermission(message.channel, true).allowed;
    const result = await this.api.post<RerollOk | RerollFail>('/internal/v1/gacha/reroll', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
      channelId: message.channelId,
      nsfw,
    });

    if (!result.ok) {
      if (result.reason === 'vip_required') {
        await message.reply(t('reroll.vip_required'));
        return;
      }
      if (result.reason === 'no_summon') {
        await message.reply(t('reroll.no_summon'));
        return;
      }
      if (result.reason === 'none_left') {
        await message.reply(
          t('reroll.none_left', { time: result.resetAt ? discordRelative(new Date(result.resetAt)) : '—' }),
        );
        return;
      }
      await message.reply(t('error.generic'));
      return;
    }

    const embed = buildCharacterEmbed(result.character, result.character.imageUrl, t);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`bind:${result.character.id}:${user.discordId}:${Date.now()}`)
        .setStyle(ButtonStyle.Success)
        .setLabel(t('summon.bind_button')),
    );
    await message.reply({ embeds: [embed], components: [row] });
  };
}
