import { type Rarity,RARITY_COLORS } from '@config';
import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

export interface CharacterEmbedView {
  id: number;
  name: string;
  rarity: Rarity;
  series: string | null;
}

export function characterColor(character: { rarity: Rarity }): number {
  return RARITY_COLORS[character.rarity];
}

export function buildCharacterEmbed(
  character: CharacterEmbedView,
  imageUrl: string | null,
  t: TranslateFn,
): EmbedBuilder {
  const rarityLabel = t(`common.rarity.${character.rarity}`);
  const embed = new EmbedBuilder()
    .setTitle(character.name)
    .setColor(characterColor(character))
    .setFooter({
      text: t('summon.footer', { id: character.id, series: character.series ?? '—', rarity: rarityLabel }),
    });
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}
