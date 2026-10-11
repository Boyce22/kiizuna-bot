import { RARITY_COLORS } from '@config';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

const BOSS_COLOR = 0xb03a3a;

type StartResult =
  | {
      ok: true;
      token: string;
      url: string;
      boss: {
        name: string;
        hp: number;
        atk: number;
        def: number;
        speed: number;
        imageUrl: string | null;
        mode: 'solo' | 'group';
        rarity: string | null;
        series: string | null;
        charId: number | null;
      };
    }
  | { ok: false; reason: 'no_boss' | 'empty_harem' };

export class BossCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'boss', execute: this.handleBoss },
    ];
  }

  private handleBoss = async (ctx: CommandContext): Promise<void> => {
    const { invocation, user, t } = ctx;
    if (!invocation.guildId) return;

    const result = await this.api.post<StartResult>('/internal/v1/boss/start', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      channelId: invocation.channelId,
    });
    if (!result.ok) {
      await invocation.reply(t(result.reason === 'no_boss' ? 'boss.no_boss' : 'boss.empty_harem'));
      return;
    }

    const reply = await invocation.reply({
      embeds: [this.bossEmbed(result.boss, t)],
      components: [this.bossRow(t)],
    });

    try {
      const interaction = await reply.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === invocation.author.id,
        time: 60_000,
      });
      await interaction.reply({
        content: t('boss.url', { url: result.url }),
        flags: MessageFlags.Ephemeral,
      });
    } catch {
      // Timeout — o botão expira silenciosamente.
    }
  };

  private bossEmbed(boss: Extract<StartResult, { ok: true }>['boss'], t: CommandContext['t']): EmbedBuilder {
    const series = boss.series ? `-# *${boss.series}*` : '-# —';
    const embed = new EmbedBuilder()
      .setAuthor({ name: t('boss.title') })
      .setColor(boss.rarity ? RARITY_COLORS[boss.rarity as keyof typeof RARITY_COLORS] : BOSS_COLOR)
      .setDescription(
        [
          series,
          `**${boss.name}**`,
          '',
          t(`boss.mode.${boss.mode}`),
          '',
          t('boss.hp', { hp: boss.hp.toLocaleString() }),
          t('collection.attrs', { atk: boss.atk, speed: boss.speed, def: boss.def }),
        ].join('\n'),
      );
    if (boss.rarity) {
      embed.setFooter({
        text: t('summon.footer', {
          id: boss.charId ?? '—',
          series: boss.series ?? '—',
          rarity: t(`common.rarity.${boss.rarity}`),
        }),
      });
    }
    if (boss.imageUrl) embed.setImage(boss.imageUrl);
    return embed;
  }

  private bossRow(t: CommandContext['t']): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Primary).setCustomId('boss_enter').setLabel(t('boss.enter')).setEmoji('⚔️'),
    );
  }
}
