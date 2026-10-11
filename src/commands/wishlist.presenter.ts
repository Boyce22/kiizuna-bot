import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

type CharacterType = 'waifu' | 'husbando' | 'unknown' | string;
const TYPE_EMOJI: Record<string, string> = { waifu: '♀️', husbando: '♂️', unknown: '❔' };

export interface WishlistLineView {
  characterId: number;
  character: {
    id: number;
    name: string;
    series: string | null;
    rarity: string;
    type: CharacterType;
  } | null;
}

export function buildWishlistEmbed(
  entries: WishlistLineView[],
  meta: { targetName: string; page: number; totalPages: number; offset: number },
  t: TranslateFn,
): EmbedBuilder {
  const lines = entries.map((entry, i) => {
    const c = entry.character;
    const name = c?.name ?? `#${entry.characterId}`;
    const gender = c ? `${TYPE_EMOJI[c.type as string] ?? ''} ` : '';
    const rarity = c ? ` • ${t(`common.rarity.${c.rarity}`)}` : '';
    const series = c?.series ? ` — ${c.series}` : '';
    return `\`${meta.offset + i + 1}.\` ${gender}**${name}**${rarity}${series}`;
  });

  return new EmbedBuilder()
    .setTitle(t('wishlist.list.title', { user: meta.targetName }))
    .setDescription(lines.join('\n'))
    .setFooter({ text: t('collection.page', { current: meta.page + 1, total: meta.totalPages }) });
}
