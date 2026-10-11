import { discordRelative } from '@utils';
import { EmbedBuilder } from 'discord.js';

import type { TranslateFn } from '../interfaces';

interface PageMeta {
  page: number;
  totalPages: number;
}

export interface ListingView {
  id: number;
  price: number;
  sellerId: string;
  characterName: string;
  rarity: string;
  imageUrl: string | null;
  series: string | null;
}

export interface AuctionView {
  id: number;
  startingBid: number;
  currentBid: number;
  currentBidderId: string | null;
  buyNowPrice: number | null;
  sellerId: string;
  endsAt: string;
  characterName: string;
  rarity: string;
}

const rarity = (r: string, t: TranslateFn): string => t(`common.rarity.${r}`);
const pageFooter = (m: PageMeta, t: TranslateFn) =>
  t('collection.page', { current: m.page + 1, total: m.totalPages });

export function buildListingsEmbed(rows: ListingView[], meta: PageMeta, t: TranslateFn): EmbedBuilder {
  const lines = rows.map(
    (r) =>
      `\`#${r.id}\` **${r.characterName}** · ${rarity(r.rarity, t)} — **${r.price}** 💰 · <@${r.sellerId}>`,
  );
  return new EmbedBuilder()
    .setTitle(t('market.list.title'))
    .setDescription(lines.join('\n'))
    .setFooter({ text: pageFooter(meta, t) });
}

export function buildAuctionsEmbed(rows: AuctionView[], meta: PageMeta, t: TranslateFn): EmbedBuilder {
  const lines = rows.map((r) => {
    const price = r.currentBid > 0 ? r.currentBid : r.startingBid;
    return `\`#${r.id}\` **${r.characterName}** · ${rarity(r.rarity, t)} — **${price}** 💰 · ⏰ ${discordRelative(new Date(r.endsAt))}`;
  });
  return new EmbedBuilder()
    .setTitle(t('auction.list.title'))
    .setDescription(lines.join('\n'))
    .setFooter({ text: pageFooter(meta, t) });
}

export function buildAuctionInfoEmbed(v: AuctionView, t: TranslateFn): EmbedBuilder {
  const lines = [
    `🏷️ ${rarity(v.rarity, t)}`,
    `${t('auction.info.current')}: **${v.currentBid > 0 ? v.currentBid : '—'}** 💰`,
    `${t('auction.info.starting')}: ${v.startingBid} 💰`,
  ];
  if (v.buyNowPrice != null) lines.push(`${t('auction.info.buynow')}: ${v.buyNowPrice} 💰`);
  lines.push(`⏰ ${discordRelative(new Date(v.endsAt))} · <@${v.sellerId}>`);
  return new EmbedBuilder().setTitle(`#${v.id} • ${v.characterName}`).setDescription(lines.join('\n'));
}
