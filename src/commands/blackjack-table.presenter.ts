import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

import {
  BJ_COLORS,
  BJ_THUMBNAIL_REF,
  bjHandBlock,
  bjHiddenDealerBlock,
  type Card,
} from './blackjack.presenter';

// ------------------------------------------------------------
// CUSTOM IDs
// ------------------------------------------------------------

export const BJT_JOIN_ID = 'bjt_join';
export const BJT_START_ID = 'bjt_start';
export const BJT_CANCEL_ID = 'bjt_cancel';

// ------------------------------------------------------------
// LOBBY
// ------------------------------------------------------------

export interface BjTableLobbyOptions {
  hostId: string;
  playerIds: string[];
  bet: number;
  maxPlayers: number;
  joinWindowSeconds: number;
  /** Linha de regras opcional exibida no lobby. */
  rules?: string;
  t: TranslateFn;
}

/** Embed da mesa em fase de lobby: aposta fixa, lista de quem j├í entrou. */
export function bjtLobbyEmbed(opts: BjTableLobbyOptions): EmbedBuilder {
  const lines = opts.playerIds.map((id) => `<@${id}>${id === opts.hostId ? ' ­ƒææ' : ''}`);
  const description = opts.rules ? `${lines.join('\n')}\n\n­ƒôû ${opts.rules}` : lines.join('\n');
  const embed = new EmbedBuilder()
    .setTitle(opts.t('blackjackTable.lobby_title', { bet: opts.bet }))
    .setDescription(description)
    .setFooter({
      text: opts.t('blackjackTable.lobby_footer', {
        count: opts.playerIds.length,
        max: opts.maxPlayers,
        seconds: opts.joinWindowSeconds,
      }),
    });

  if (BJ_THUMBNAIL_REF) embed.setThumbnail(BJ_THUMBNAIL_REF);
  return embed;
}

// ------------------------------------------------------------
// MESA EXPIRADA / SEM JOGADORES SUFICIENTES
// ------------------------------------------------------------

export interface BjTableNotEnoughOptions {
  bet: number;
  t: TranslateFn;
}

/** Embed exibido quando a mesa expira sem jogadores suficientes. */
export function bjtNotEnoughEmbed(opts: BjTableNotEnoughOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(opts.t('blackjackPvp.not_enough_title'))
    .setDescription(
      `> ${opts.t('blackjackPvp.not_enough_line1')}\n> ${opts.t('blackjackPvp.not_enough_line2', { bet: opts.bet })}`,
    )
    .setColor(BJ_COLORS.push)
    .setFooter({ text: opts.t('blackjackPvp.not_enough_footer') });

  if (BJ_THUMBNAIL_REF) embed.setThumbnail(BJ_THUMBNAIL_REF);
  return embed;
}

export interface BjTableCancelledOptions {
  /** Comando usado no rodap├® ("tente novamente com k!<command>"). */
  command: string;
  t: TranslateFn;
}

/** Embed exibido quando o anfitri├úo fecha a mesa antes de iniciar (mesmo padr├úo do expirado). */
export function bjtCancelledEmbed(opts: BjTableCancelledOptions): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(opts.t('blackjackTable.cancelled_title'))
    .setDescription(
      `> ${opts.t('blackjackTable.cancelled_line1')}\n> ${opts.t('blackjackTable.cancelled_line2')}`,
    )
    .setColor(BJ_COLORS.push)
    .setFooter({ text: opts.t('blackjackTable.cancelled_footer', { command: opts.command }) });

  if (BJ_THUMBNAIL_REF) embed.setThumbnail(BJ_THUMBNAIL_REF);
  return embed;
}

/** Linha de bot├Áes do lobby: Entrar / Iniciar agora / Fechar mesa (s├│ host). */
export function bjtLobbyButtons(
  t: TranslateFn,
  joinDisabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BJT_JOIN_ID)
      .setStyle(ButtonStyle.Success)
      .setLabel(t('blackjackTable.join'))
      .setDisabled(joinDisabled),
    new ButtonBuilder()
      .setCustomId(BJT_START_ID)
      .setStyle(ButtonStyle.Primary)
      .setLabel(t('blackjackTable.start')),
    new ButtonBuilder()
      .setCustomId(BJT_CANCEL_ID)
      .setStyle(ButtonStyle.Danger)
      .setLabel(t('blackjackTable.cancel')),
  );
}

// ------------------------------------------------------------
// MESA EM JOGO / RESULTADO
// ------------------------------------------------------------

export interface BjTablePlayerView {
  displayName: string;
  hand: Card[];
  total: number;
  footer: string;
  /** Jogador da vez: destaca o campo com ÔûÂ´©Å. */
  active?: boolean;
}

export interface BjTableEmbedOptions {
  dealerHand: Card[];
  dealerTotal: number;
  /** Quando `false` mostra s├│ a primeira carta do dealer + ­ƒéá. */
  revealDealer: boolean;
  bet: number;
  title: string;
  color: number;
  players: BjTablePlayerView[];
  t: TranslateFn;
}

/** Embed da mesa multiplayer: dealer + um campo por jogador. */
export function bjtTableEmbed(opts: BjTableEmbedOptions): EmbedBuilder {
  const dealerLine = opts.revealDealer
    ? bjHandBlock(opts.dealerHand, opts.dealerTotal)
    : bjHiddenDealerBlock(opts.dealerHand[0]);

  const embed = new EmbedBuilder()
    .setTitle(opts.title)
    .setColor(opts.color)
    .addFields({ name: opts.t('blackjack.dealer'), value: dealerLine, inline: false });

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
