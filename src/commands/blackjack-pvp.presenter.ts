import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

import { BJ_THUMBNAIL_REF, bjHandBlock, type Card } from './blackjack.presenter';

export interface BjPvpPlayerView {
  displayName: string;
  hand: Card[];
  total: number;
  footer: string;
  /** Jogador da vez: destaca o campo com ÔûÂ´©Å. */
  active?: boolean;
}

export interface BjPvpEmbedOptions {
  title: string;
  color: number;
  players: BjPvpPlayerView[];
  t: TranslateFn;
}

/** Embed da mesa PvP: um campo por jogador, sem dealer. */
export function bjpvpEmbed(opts: BjPvpEmbedOptions): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(opts.title).setColor(opts.color);
  for (const p of opts.players) {
    embed.addFields({
      name: p.active ? `­ƒÄ▓ ${p.displayName}` : p.displayName,
      value: `${bjHandBlock(p.hand, p.total)}\n${p.footer}`,
      inline: false,
    });
  }
  if (BJ_THUMBNAIL_REF) embed.setThumbnail(BJ_THUMBNAIL_REF);
  return embed;
}
