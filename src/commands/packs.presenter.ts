import { type Rarity, RARITY_COLORS, RARITY_EMOJI } from '@config';
import { discordRelative } from '@utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

export interface PackView {
  id: string;
  name: string;
  description: string;
  artUrl: string | null;
  poolSize: number;
  odds: Record<Rarity, number>;
  featured: number[];
}

export interface Countdown {
  left: number;
  resetAt: string | null;
}

export interface OpenedCard {
  id: number;
  name: string;
  series: string | null;
  rarity: Rarity;
  imageUrl: string | null;
  owned: boolean;
}

export interface OpeningView {
  id: string;
  packId: string;
  packName: string;
  cards: OpenedCard[];
  pickedCharacterId: number | null;
  leftovers: number[];
  stealableUntil: string | null;
  openedAt: string;
}

export interface PacksState {
  showcase: PackView[];
  charges: Countdown;
  refreshes: Countdown;
  held: Array<{ pack: PackView; amount: number }>;
  heldTotal: number;
  heldMax: number;
  pending: OpeningView | null;
}

/** Prefixo dos botões de pack (`events.ts` despacha por ele). */
export const PACKS_CUSTOM_ID = 'pk';

/** Limite de texto de um botão do Discord. */
const BUTTON_LABEL_MAX = 80;

const HIGH_RARITIES: Rarity[] = ['UR', 'SSR', 'SR'];

function label(text: string): string {
  if (text.length <= BUTTON_LABEL_MAX) return text;
  return text.slice(0, BUTTON_LABEL_MAX - 1) + '…';
}

function percent(chance: number): string {
  const value = chance * 100;
  if (value >= 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(2)}%`;
}

/** As raridades altas que o pack entrega, com a chance de cada uma. */
function oddsLine(odds: Record<Rarity, number>): string {
  return HIGH_RARITIES.filter((rarity) => odds[rarity] > 0)
    .map((rarity) => `${RARITY_EMOJI[rarity]} ${rarity} \`${percent(odds[rarity])}\``)
    .join(' · ');
}

function chargesLine(charges: Countdown, t: TranslateFn): string {
  if (!charges.resetAt) return t('packs.charges_full', { left: charges.left });
  const time = discordRelative(new Date(charges.resetAt));
  return t('packs.charges', { left: charges.left, time });
}

function row(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

/** Vitrine: os três packs, as escolhas que restam e o inventário. */
export function renderShowcase(state: PacksState, ownerId: string, t: TranslateFn) {
  const embed = new EmbedBuilder().setTitle(t('packs.title')).setColor(0x8a5cf6);
  for (const pack of state.showcase) {
    const pool = t('packs.pool', { size: pack.poolSize });
    embed.addFields({ name: pack.name, value: `${pack.description}\n${pool} · ${oddsLine(pack.odds)}` });
  }

  const heldLine = state.heldTotal
    ? t('packs.held', { total: state.heldTotal, max: state.heldMax })
    : t('packs.held_none');
  embed.setDescription(`${chargesLine(state.charges, t)}\n${heldLine}`);

  const picks = state.showcase.map((pack) =>
    new ButtonBuilder()
      .setCustomId(`${PACKS_CUSTOM_ID}:pick:${pack.id}:${ownerId}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel(label(pack.name))
      .setDisabled(state.charges.left <= 0),
  );

  const extras: ButtonBuilder[] = [];
  if (state.refreshes.left > 0) {
    extras.push(
      new ButtonBuilder()
        .setCustomId(`${PACKS_CUSTOM_ID}:refresh:${ownerId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(t('packs.refresh_button', { left: state.refreshes.left })),
    );
  }
  if (state.pending) {
    extras.push(
      new ButtonBuilder()
        .setCustomId(`${PACKS_CUSTOM_ID}:resume:${ownerId}`)
        .setStyle(ButtonStyle.Success)
        .setLabel(t('packs.resume_button')),
    );
  }

  const components = [row(picks)];
  if (extras.length) components.push(row(extras));
  return { embeds: [embed], components };
}

/** Resposta da escolha na vitrine: o pack guardado e o botão de abrir agora. */
export function renderPicked(pack: PackView, amount: number, ownerId: string, t: TranslateFn) {
  const open = new ButtonBuilder()
    .setCustomId(`${PACKS_CUSTOM_ID}:open:${pack.id}:${ownerId}`)
    .setStyle(ButtonStyle.Success)
    .setLabel(t('packs.open_button'));
  return { content: t('packs.picked', { name: pack.name, amount }), components: [row([open])] };
}

function cardEmbed(card: OpenedCard, opening: OpeningView, ownerId: string, t: TranslateFn): EmbedBuilder {
  const lines = [card.series ?? '—'];
  const picked = card.id === opening.pickedCharacterId;
  const stolen = !!opening.pickedCharacterId && !picked && !opening.leftovers.includes(card.id);
  if (picked) lines.push(t('packs.took_mark', { user: `<@${ownerId}>` }));
  if (stolen) lines.push(t('packs.stolen_mark'));

  const embed = new EmbedBuilder()
    .setTitle(`${RARITY_EMOJI[card.rarity]} ${card.name}`)
    .setColor(RARITY_COLORS[card.rarity])
    .setDescription(lines.join('\n'));
  if (card.imageUrl) embed.setThumbnail(card.imageUrl);
  return embed;
}

/**
 * A mesa de um pack aberto. Antes da escolha: um botão por carta (só o dono escolhe). Depois:
 * botões de roubo nas sobras enquanto a janela estiver aberta (a API confere a janela no clique).
 */
export function renderTable(opening: OpeningView, packName: string, ownerId: string, t: TranslateFn) {
  const header = t('packs.open_title', { user: `<@${ownerId}>`, pack: packName });
  const hint = opening.stealableUntil
    ? t('packs.leftover_until', { time: discordRelative(new Date(opening.stealableUntil)) })
    : t('packs.open_hint');
  const content = `${header}\n${hint}`;
  const embeds = opening.cards.map((card) => cardEmbed(card, opening, ownerId, t));

  if (!opening.pickedCharacterId) {
    const takes = opening.cards.map((card, index) =>
      new ButtonBuilder()
        .setCustomId(`${PACKS_CUSTOM_ID}:take:${opening.id}:${card.id}:${ownerId}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel(label(t('packs.take_button', { index: index + 1, name: card.name }))),
    );
    return { content, embeds, components: [row(takes)] };
  }

  const stealable = opening.stealableUntil ? opening.cards.filter((card) => opening.leftovers.includes(card.id)) : [];
  const steals = stealable.map((card) =>
    new ButtonBuilder()
      .setCustomId(`${PACKS_CUSTOM_ID}:steal:${opening.id}:${card.id}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel(label(t('packs.steal_button', { name: card.name }))),
  );
  const components = steals.length ? [row(steals)] : [];
  return { content, embeds, components };
}
