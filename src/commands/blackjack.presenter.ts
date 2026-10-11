import { join } from 'node:path';

import { ui } from '@config';
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

import type { TranslateFn } from '../interfaces';

// ------------------------------------------------------------
// 1. TIPOS E CONSTANTES DO BARALHO
// ------------------------------------------------------------

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export interface Card {
  rank: (typeof RANKS)[number];
  suit: (typeof SUITS)[number];
}

// ------------------------------------------------------------
// 2. CONSTANTES DE COR
// ------------------------------------------------------------

const COLOR_PLAYER_TURN = 0x35654d; // verde-feltro (mesa)
const COLOR_WIN = 0x4caf50; // verde
const COLOR_LOSE = 0xf44336; // vermelho
const COLOR_PUSH = 0x9e9e9e; // cinza

export const BJ_COLORS = {
  playerTurn: COLOR_PLAYER_TURN,
  win: COLOR_WIN,
  lose: COLOR_LOSE,
  push: COLOR_PUSH,
} as const;

// ------------------------------------------------------------
// 3. CUSTOM IDs DOS BOT├òES
// ------------------------------------------------------------

export const BJ_HIT_ID = 'bj_hit';
export const BJ_STAND_ID = 'bj_stand';

// ------------------------------------------------------------
// 4. UTILIT├üRIOS DE EXIBI├ç├âO
// ------------------------------------------------------------

/** Refer├¬ncia do thumbnail anexado (`attachment://blackjack.png`) ou null se desativado. */
export const BJ_THUMBNAIL_REF = ui.blackjack.thumbnailPath
  ? `attachment://${ui.blackjack.thumbnailName}`
  : null;

/**
 * Constr├│i o anexo do thumbnail pra incluir em `files` no primeiro envio da mensagem.
 * Edi├º├Áes seguintes mant├¬m o anexo, ent├úo s├│ o envio inicial precisa dele.
 * Retorna `null` quando o thumbnail est├í desativado.
 */
export function bjThumbnailFile(): AttachmentBuilder | null {
  if (!ui.blackjack.thumbnailPath) return null;
  return new AttachmentBuilder(join(process.cwd(), ui.blackjack.thumbnailPath), {
    name: ui.blackjack.thumbnailName,
  });
}

const ANSI_RESET = '\u001b[0m';

/** Uma carta colorida por naipe para blocos ```ansi```: vermelho (ÔÖÑÔÖª) ou branco (ÔÖáÔÖú). */
function bjAnsiCard(c: Card): string {
  const isRed = c.suit === '♥' || c.suit === '♦';
  return `\u001b[1;${isRed ? 31 : 37}m${c.rank}${c.suit}${ANSI_RESET}`;
}

/**
 * Renderiza uma m├úo dentro de um bloco ```ansi```: cartas coloridas por naipe e,
 * quando informado, o total em negrito. O bloco d├í largura monoespa├ºada + cor;
 * em clientes sem suporte a ansi degrada pra monoespa├ºado simples (sem cor).
 */
export function bjHandBlock(cards: Card[], total?: number): string {
  const hand = cards.map(bjAnsiCard).join('  ');
  const tail = total === undefined ? '' : `   \u001b[1m${total}\u001b[0m`;
  return `\`\`\`ansi\n${hand}${tail}\n\`\`\``;
}

/** Glifo Unicode da carta virada (verso) do dealer. */
const CARD_BACK = '­ƒéá';

/**
 * M├úo do dealer com a segunda carta oculta: s├│ a carta de cima vis├¡vel,
 * seguida do verso (­ƒéá), tudo no mesmo bloco ```ansi``` monoespa├ºado.
 */
export function bjHiddenDealerBlock(up: Card): string {
  return `\`\`\`ansi\n${bjAnsiCard(up)}  ${CARD_BACK}\n\`\`\``;
}

// ------------------------------------------------------------
// 5. EMBEDS
// ------------------------------------------------------------

export interface BjGameEmbedOptions {
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  /** Quando `false` mostra s├│ a primeira carta do dealer + ­ƒéá. */
  revealDealer: boolean;
  bet: number;
  footer: string;
  color: number;
  /** Linha de regras opcional, anexada ao rodap├® (s├│ nos frames de jogo). */
  hint?: string;
  t: TranslateFn;
}

/** Embed da mesa de blackjack. */
export function bjGameEmbed(opts: BjGameEmbedOptions): EmbedBuilder {
  const dealerLine = opts.revealDealer
    ? bjHandBlock(opts.dealerHand, opts.dealerTotal)
    : bjHiddenDealerBlock(opts.dealerHand[0]);

  const embed = new EmbedBuilder()
    .setTitle(opts.t('blackjack.title', { bet: opts.bet }))
    .setColor(opts.color)
    .addFields(
      { name: opts.t('blackjack.dealer'), value: dealerLine, inline: false },
      {
        name: opts.t('blackjack.you'),
        value: bjHandBlock(opts.playerHand, opts.playerTotal),
        inline: false,
      },
    )
    .setFooter({ text: opts.hint ? `${opts.footer}\n${opts.hint}` : opts.footer })
    .setTimestamp();

  if (BJ_THUMBNAIL_REF) embed.setThumbnail(BJ_THUMBNAIL_REF);
  return embed;
}

// ------------------------------------------------------------
// 6. BOT├òES
// ------------------------------------------------------------

/** Linha de bot├Áes: Hit (Comprar) / Stand (Parar). */
export function bjButtons(
  t: TranslateFn,
  disabled: boolean,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BJ_HIT_ID)
      .setStyle(ButtonStyle.Success)
      .setLabel(t('blackjack.hit'))
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(BJ_STAND_ID)
      .setStyle(ButtonStyle.Danger)
      .setLabel(t('blackjack.stand'))
      .setDisabled(disabled),
  );
}

// ------------------------------------------------------------
// 7. MENSAGENS DE RESULTADO
// ------------------------------------------------------------

/**
 * Retorna o texto de rodap├® conforme o resultado da partida.
 * O comando realiza as opera├º├Áes de moedas separadamente e
 * repassa os valores j├í calculados.
 */
export function bjOutcomeFooter(
  outcome: 'win' | 'lose' | 'push' | 'blackjack',
  bet: number,
  payout: number,
  t: TranslateFn,
): string {
  switch (outcome) {
    case 'lose':
      return t('blackjack.lose', { bet });
    case 'push':
      return t('blackjack.push');
    case 'blackjack':
      return t('blackjack.blackjack', { amount: payout });
    case 'win':
      return t('blackjack.win', { amount: bet });
  }
}
