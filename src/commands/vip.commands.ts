import { TIER_ORDER, VIP_TIERS, type VipTierKey } from '@config';
import { discordRelative, isBotOwner } from '@utils';
import { EmbedBuilder } from 'discord.js';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

const PAID_TIERS = TIER_ORDER.filter((t): t is Exclude<VipTierKey, 'none'> => t !== 'none');
const isPaidTier = (s: string): s is Exclude<VipTierKey, 'none'> => (PAID_TIERS as string[]).includes(s);

export class VipCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'vip', execute: this.handleVip },
      { name: 'vip-admin', execute: this.handleVipAdmin },
    ];
  }

  private handleVip = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const sub = (args[0] ?? '').toLowerCase();

    if (sub === 'status') {
      const { subscription } = await this.api.post<{
        subscription: {
          vipTier: VipTierKey;
          status: string;
          provider: string;
          autoRenew: boolean;
          currentPeriodEnd: string | null;
        } | null;
      }>('/internal/v1/vip/subscription', { discordId: user.discordId, username: user.username ?? undefined });
      if (!subscription || subscription.status !== 'active') {
        await invocation.reply(t('vip.status.none'));
        return;
      }
      await invocation.reply(
        t('vip.status.active', {
          tier: VIP_TIERS[subscription.vipTier].name,
          provider: subscription.provider,
          ends: subscription.currentPeriodEnd ? discordRelative(new Date(subscription.currentPeriodEnd)) : '—',
          auto: subscription.autoRenew ? '✅' : '❌',
        }),
      );
      return;
    }

    if (sub === 'perks' || sub === 'privilegios' || sub === 'privileges') {
      const arg = (args[1] ?? '').toLowerCase();
      const status = await this.api.post<{ tier: VipTierKey }>('/internal/v1/vip/status', {
        discordId: user.discordId,
        username: user.username ?? undefined,
      });
      const tierKey: VipTierKey = arg in VIP_TIERS ? (arg as VipTierKey) : status.tier;
      const perks = VIP_TIERS[tierKey];
      const yn = (b: boolean): string => (b ? '✅' : '❌');
      const embed = new EmbedBuilder()
        .setTitle(t('vip.perks.title', { tier: `${perks.emoji} ${perks.name}`.trim() }))
        .setColor(perks.embedColor ?? 0x8a2be2)
        .setDescription(
          t('vip.perks.body', {
            rolls: perks.rollsPerInterval,
            cooldown: perks.bindCooldownMin,
            steal: perks.stealCooldownMin,
            rerolls: perks.rerollsPerDay,
            tribute: perks.tributeMultiplier,
            wishlist: perks.wishlistSlots,
            showcase: perks.showcaseSlots,
            targets: perks.targetTokensPerDay,
            tax: `${Math.round(perks.marketTaxFloor * 100)}%`,
            quota: perks.marketCheapQuota,
            listings: Number.isFinite(perks.listingSlots) ? perks.listingSlots : '∞',
            frame: yn(perks.showcaseFrame),
            soulmate: yn(perks.level >= VIP_TIERS.kizuna.level),
          }),
        )
        .setFooter({ text: t('vip.perks.footer') });
      await invocation.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'checkout') {
      const tier = (args[1] ?? '').toLowerCase();
      if (!isPaidTier(tier)) {
        await invocation.reply(t('vip.invalid_tier'));
        return;
      }
      const result = await this.api.call<{ url: string }>('/internal/v1/vip/checkout', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        tier,
      });
      if (!result.ok) {
        await invocation.reply(t('vip.checkout_unavailable'));
        return;
      }
      await invocation.reply(t('vip.checkout', { tier: VIP_TIERS[tier].name, price: VIP_TIERS[tier].priceUsd, url: result.url }));
      return;
    }

    const status = await this.api.post<{ tier: VipTierKey }>('/internal/v1/vip/status', {
      discordId: user.discordId,
      username: user.username ?? undefined,
    });
    const perks = VIP_TIERS[status.tier];
    const tierLines = PAID_TIERS.map((k) =>
      t('vip.tier_line', { emoji: VIP_TIERS[k].emoji, name: VIP_TIERS[k].name, price: VIP_TIERS[k].priceUsd }),
    );
    const embed = new EmbedBuilder()
      .setTitle(t('vip.overview.title', { tier: perks.name }))
      .setColor(perks.embedColor ?? 0x8a2be2)
      .setDescription(
        t('vip.overview.current', {
          rolls: perks.rollsPerInterval,
          wishlist: perks.wishlistSlots,
          cooldown: perks.bindCooldownMin,
          steal: perks.stealCooldownMin,
        }),
      )
      .addFields({ name: t('vip.overview.tiers'), value: tierLines.join('\n') })
      .setFooter({ text: t('vip.overview.upgrade') });
    await invocation.reply({ embeds: [embed] });
  };

  private handleVipAdmin = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }
    const sub = (args[0] ?? '').toLowerCase();
    const target = invocation.mentions.users.first();
    if (sub === 'grant') {
      const tier = (args.find((a) => isPaidTier(a.toLowerCase())) ?? '').toLowerCase();
      const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);
      if (!target || !isPaidTier(tier)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}vip-admin grant @user <tier> [dias]' }));
        return;
      }
      await this.api.post('/internal/v1/vip/admin/grant', {
        actorDiscordId: user.discordId,
        targetDiscordId: target.id,
        tier,
        days,
      });
      await invocation.reply(t('vip.granted', { user: `<@${target.id}>`, tier: VIP_TIERS[tier].name, days }));
      return;
    }
    if (sub === 'lookup') {
      if (!target) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}vip-admin lookup @user' }));
        return;
      }
      const { subscription } = await this.api.post<{
        subscription: {
          vipTier: VipTierKey;
          status: string;
          provider: string;
          currentPeriodEnd: string | null;
        } | null;
      }>('/internal/v1/vip/admin/lookup', { actorDiscordId: user.discordId, targetDiscordId: target.id });
      if (!subscription) {
        await invocation.reply(t('vip.lookup.none', { user: `<@${target.id}>` }));
        return;
      }
      await invocation.reply(
        t('vip.lookup.found', {
          user: `<@${target.id}>`,
          tier: VIP_TIERS[subscription.vipTier].name,
          status: subscription.status,
          provider: subscription.provider,
          ends: subscription.currentPeriodEnd ? discordRelative(new Date(subscription.currentPeriodEnd)) : '—',
        }),
      );
      return;
    }
    await invocation.reply(t('error.missing_args', { usage: '{prefix}vip-admin grant|lookup @user ...' }));
  };
}
