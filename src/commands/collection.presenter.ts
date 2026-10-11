import type { Rarity } from '@config';
import { characterColor } from '@utils';
import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

export interface CollectionCardView {
  nickname: string | null;
  atk: number;
  speed: number;
  def: number;
  character: { id: number; name: string; rarity: Rarity; series: string | null };
}

export interface CollectionPageMeta {
  targetName: string;
  page: number; // 0-based
  totalPages: number;
  nsfw: boolean;
  bond: number; // bond efetivo (com decay lazy aplicado)
}

// Render de uma entrada do harém na coleção (1 personagem por página, com imagem).
export function buildCollectionEmbed(
  row: CollectionCardView,
  imageUrl: string | null,
  meta: CollectionPageMeta,
  t: TranslateFn,
): EmbedBuilder {
  const c = row.character;
  const rarityLabel = t(`common.rarity.${c.rarity}`);
  const tabLabel = meta.nsfw ? t('collection.tab.nsfw') : t('collection.tab.sfw');
  const name = row.nickname ? `${c.name} • ${row.nickname}` : c.name;
  // Série (subtext) colada ACIMA do nome em negrito — sem o gap que um heading (##) abriria.
  const series = c.series ? `-# *${c.series}*` : '-# —';

  const embed = new EmbedBuilder()
    .setAuthor({ name: t('collection.title', { user: meta.targetName }) })
    .setColor(characterColor(c))
    .setDescription(
      [
        series,
        `**${name}**`,
        '',
        t('collection.bond', { value: meta.bond }),
        '',
        t('collection.attrs', { atk: row.atk, speed: row.speed, def: row.def }),
        '',
        t('collection.rarity', { rarity: rarityLabel }),
      ].join('\n'),
    )
    // Id no rodapé — mesmo visual de subtext da data de entrada no profile.
    .setFooter({
      text: `#${c.id} • ${t('collection.page', { current: meta.page + 1, total: meta.totalPages })} • ${tabLabel}`,
    });
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}
