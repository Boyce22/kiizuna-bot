import { rankById,RANKS } from '@config';
import {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

import type { TranslateFn } from '../interfaces';

// Dourado da escada de ranks (mesma fam├¡lia do ­ƒÅå do t├¡tulo).
const ACCENT_COLOR = 0xf1c40f;

// Espa├ºo ideogr├ífico (U+3000): gap visual que n├úo colapsa no markdown do Discord.
const WIDE_GAP = 'ÒÇÇ';

const sep = (divider = true): SeparatorBuilder =>
  new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Large);

/**
 * Percentil de corte ÔåÆ "top X%" enxuto (sem zeros ├á toa).
 * 0.999 ÔåÆ 0.1 ┬À 0.99 ÔåÆ 1 ┬À 0.93 ÔåÆ 7 ┬À 0 ÔåÆ 100
 */
function topPercent(minPercentile: number): string {
  const pct = Math.round((100 - minPercentile * 100) * 10) / 10;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
}

/**
 * Card da escada de ranks (Components V2): t├¡tulo + legenda do rank atual,
 * a escada inteira (topo ÔåÆ base) com o rank do jogador destacado, e um rodap├®.
 */
export function buildRanksContainer(currentRankId: number, t: TranslateFn): ContainerBuilder {
  const current = rankById(currentRankId);
  const currentName = t(`rank.${current.key}.name`);

  const header = [
    `## ${t('ranks.title')}`,
    `-# ${t('ranks.caption', { emoji: current.emoji, name: currentName })}`,
  ].join('\n');

  const ladder = RANKS.map((r) => {
    const name = t(`rank.${r.key}.name`);
    // Piso da escada (percentil 0) ├® "base"; os demais mostram o corte "top X%".
    const req =
      r.minPercentile <= 0
        ? t('ranks.req_floor')
        : t('ranks.req', { pct: topPercent(r.minPercentile) });

    // Rank do jogador: linha inteira em negrito + seta. Demais: nome em negrito,
    // requisito em it├ílico discreto.
    return r.id === currentRankId
      ? `**${r.emoji} ${name} ┬À ${req}**${WIDE_GAP}Ô¼à´©Å ${t('ranks.you')}`
      : `${r.emoji} **${name}** ┬À *${req}*`;
  }).join('\n');

  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
    .addSeparatorComponents(sep())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(ladder))
    .addSeparatorComponents(sep(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${t('ranks.footer')}`));
}
