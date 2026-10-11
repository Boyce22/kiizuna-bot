import { rankById, RARITY_COLORS, type VipPerks } from '@config';
import {
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';

import type { TranslateFn } from '../interfaces';

const DEFAULT_COLOR = 0x9b59b6;
const formatNumber = (n: number): string => n.toLocaleString('en-US');
const discordDate = (iso: string): string => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`;
const sep = (divider = true): SeparatorBuilder =>
  new SeparatorBuilder().setDivider(divider).setSpacing(SeparatorSpacingSize.Large);

export interface ProfilePayload {
  coins: number;
  globalRank: number;
  duelWins: number;
  tributeStreak: number;
  createdAt: string;
  perks: Pick<VipPerks, 'level' | 'name' | 'emoji'> & { embedColor: number | null };
  favoriteImageUrl: string | null;
  harem: {
    byRarity: Record<string, number>;
    favorite: {
      name: string;
      series: string | null;
      rarity: string;
      bond: number;
      isSoulmate: boolean;
    } | null;
  };
}

export interface ProfileView {
  avatarUrl: string;
}

function profileColor(perks: ProfilePayload['perks'], favorite: ProfilePayload['harem']['favorite']): number {
  if (perks.level > 0 && perks.embedColor != null) return perks.embedColor;
  if (favorite) return RARITY_COLORS[favorite.rarity as keyof typeof RARITY_COLORS] ?? DEFAULT_COLOR;
  return DEFAULT_COLOR;
}

export function buildProfileContainer(
  targetName: string,
  data: ProfilePayload,
  view: ProfileView,
  t: TranslateFn,
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(profileColor(data.perks, data.harem.favorite));
  const rank = rankById(data.globalRank);
  let tags = t('profile.hero', { badge: rank.emoji, rankName: t(`rank.${rank.key}.name`) });
  if (data.perks.level > 0) {
    tags += `　${t('profile.vip_badge', { emoji: data.perks.emoji, name: data.perks.name })}`;
  }
  const header = [`## ${t('profile.title', { user: targetName })}`, tags].join('\n');
  container.addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(view.avatarUrl)),
  );
  container.addSeparatorComponents(sep());
  const by = data.harem.byRarity;
  const stats = [
    `-# ${t('profile.stats_caption')}`,
    t('profile.stats_line', {
      mythic: formatNumber(by.mythic ?? 0),
      epic: formatNumber(by.epic ?? 0),
      rare: formatNumber(by.rare ?? 0),
      common: formatNumber(by.common ?? 0),
    }),
    `-# ${t('profile.activity_caption')}`,
    t('profile.activity_line', {
      duels: formatNumber(data.duelWins),
      streak: formatNumber(data.tributeStreak),
    }),
  ].join('\n');
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(stats));
  container.addSeparatorComponents(sep());
  const fav = data.harem.favorite;
  const favoriteText = fav
    ? `${fav.isSoulmate ? t('profile.soulmate') : t('profile.favorite')}\n${t('profile.favorite_value', {
        name: fav.name,
        series: fav.series ?? '—',
        rarity: t(`common.rarity.${fav.rarity}`),
        bond: formatNumber(fav.bond),
      })}`
    : `${t('profile.favorite')}\n${t('profile.favorite_none')}`;
  if (data.favoriteImageUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(favoriteText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(data.favoriteImageUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(favoriteText));
  }
  container.addSeparatorComponents(sep(false));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${t('profile.member_since', { date: discordDate(data.createdAt) })}`),
  );
  return container;
}
