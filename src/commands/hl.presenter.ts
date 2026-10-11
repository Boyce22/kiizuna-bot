import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

const COLOR_BASE = 0xf5a623;
const COLOR_WIN = 0x57f287;
const COLOR_LOSE = 0xed4245;

export interface HlCard {
  id: number;
  name: string;
  series: string | null;
  rarity: string;
  imageUrl: string | null;
  value: number;
}

function cardLabel(c: HlCard): string {
  return `${c.name}${c.series ? ` · *${c.series}*` : ''}`;
}

function titleText(t: TranslateFn, streak: number): string {
  return `${t('hl.title')}${streak > 0 ? ` · 🔥 ×${streak}` : ''}`;
}

export function hlPlayEmbed(current: HlCard, next: HlCard, streak: number, earned: number, t: TranslateFn): EmbedBuilder {
  const hint = next.series ? t('hl.next_series', { series: next.series }) : t('hl.next_unknown');
  const embed = new EmbedBuilder()
    .setTitle(titleText(t, streak))
    .setColor(COLOR_BASE)
    .setDescription(
      [
        `🎴 **${t('hl.label_table')}:** ${cardLabel(current)}`,
        `❓ **${t('hl.label_next')}:** ${hint}`,
        '',
        `> 💰 **${current.value}** ${t('hl.coins')}`,
        `> ${t('hl.question')}`,
      ].join('\n'),
    );
  if (current.imageUrl) embed.setThumbnail(current.imageUrl);
  const foot = [t('hl.footer_streak', { streak })];
  if (earned > 0) foot.push(t('hl.footer_banked', { earned }));
  embed.setFooter({ text: foot.join('  ·  ') });
  return embed;
}

export function hlCashoutEmbed(current: HlCard, next: HlCard, streak: number, earned: number, t: TranslateFn): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(titleText(t, streak))
    .setColor(COLOR_WIN)
    .setDescription(
      [
        `🎴 **${t('hl.label_table')}:** ${cardLabel(current)} — 💰 **${current.value}**`,
        `💰 **${t('hl.label_revealed')}:** ${cardLabel(next)} — 💰 **${next.value}**`,
      ].join('\n'),
    )
    .setFooter({ text: t('hl.cashed', { streak, earned }) });
  if (current.imageUrl) embed.setThumbnail(current.imageUrl);
  if (next.imageUrl) embed.setImage(next.imageUrl);
  return embed;
}

export function hlBustEmbed(current: HlCard, next: HlCard, t: TranslateFn): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(titleText(t, 0))
    .setColor(COLOR_LOSE)
    .setDescription(
      [
        `🎴 **${t('hl.label_table')}:** ${cardLabel(current)} — 💰 **${current.value}**`,
        `💥 **${t('hl.label_revealed')}:** ${cardLabel(next)} — 💰 **${next.value}**`,
      ].join('\n'),
    )
    .setFooter({ text: t('hl.wrong') });
  if (current.imageUrl) embed.setThumbnail(current.imageUrl);
  if (next.imageUrl) embed.setImage(next.imageUrl);
  return embed;
}

export function hlButtons(t: TranslateFn, disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hl_higher').setStyle(ButtonStyle.Success).setLabel(t('hl.higher')).setDisabled(disabled),
    new ButtonBuilder().setCustomId('hl_lower').setStyle(ButtonStyle.Danger).setLabel(t('hl.lower')).setDisabled(disabled),
    new ButtonBuilder().setCustomId('hl_stop').setStyle(ButtonStyle.Secondary).setLabel(t('hl.stop')).setDisabled(disabled),
  );
}
