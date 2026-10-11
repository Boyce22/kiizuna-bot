import { characterColor } from '@utils';
import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

export type GalleryMode = 'bond' | 'rarity' | 'soulmates';

export interface GalleryCard {
  characterId: number;
  nickname: string | null;
  atk: number;
  speed: number;
  def: number;
  bond: number;
  ownerDiscordId: string;
  character: { id: number; name: string; rarity: string; series: string | null };
}

export interface GalleryPageMeta {
  page: number;
  totalPages: number;
  ownerName: string;
  ownerIconUrl?: string;
}

export function buildGalleryEmbed(
  mode: GalleryMode,
  card: GalleryCard,
  imageUrl: string | null,
  meta: GalleryPageMeta,
  t: TranslateFn,
): EmbedBuilder {
  const c = card.character;
  const series = c.series ? `*${c.series}*` : '—';
  const rarityLabel = t(`common.rarity.${c.rarity}`);
  const description = [
    `-# #${meta.page + 1} · ${series}`,
    `**${c.name}**`,
    '',
    t('collection.bond', { value: card.bond }),
    '',
    t('collection.attrs', { atk: card.atk, speed: card.speed, def: card.def }),
    '',
    t('collection.rarity', { rarity: rarityLabel }),
  ].join('\n');
  const embed = new EmbedBuilder()
    .setAuthor({ name: t(`gallery.title.${mode}`) })
    .setColor(characterColor({ rarity: c.rarity as Parameters<typeof characterColor>[0]['rarity'] }))
    .setDescription(description)
    .setFooter({ text: `${meta.ownerName} • #${c.id}`, iconURL: meta.ownerIconUrl });
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}
