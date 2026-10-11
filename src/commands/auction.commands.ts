import { ui } from '@config';
import { discordRelative, paginate } from '@utils';

import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

import { buildAuctionInfoEmbed, buildAuctionsEmbed, type AuctionView } from './market.presenter';

export class AuctionCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'auction', execute: this.handleAuction }];
  }

  private handleAuction = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, flags, user, t } = ctx;
    const guildId = invocation.guildId!;
    const actor = { discordId: user.discordId, username: user.username ?? undefined, guildId };
    const sub = (args[0] ?? 'list').toLowerCase();

    if (sub === 'start') {
      const characterId = Number(args[1]);
      if (!Number.isInteger(characterId)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}auction start <id_personagem> [lance] [--buynow x] [--horas h]' }));
        return;
      }
      const result = await this.api.post<
        { ok: true; auctionId: number; endsAt: string } | { ok: false; reason: string; floor?: number }
      >('/internal/v1/market/auction/start', {
        ...actor,
        characterId,
        startingBid: args[2] && /^\d+$/.test(args[2]) ? Number(args[2]) : undefined,
        buyNow: typeof flags.buynow === 'string' ? Number(flags.buynow) : undefined,
        hours: typeof flags.horas === 'string' ? Number(flags.horas) : undefined,
      });
      if (!result.ok) {
        await invocation.reply(t(`auction.${result.reason}`, { floor: result.floor ?? 0 }));
        return;
      }
      await invocation.reply(t('auction.started', { id: result.auctionId, ends: discordRelative(new Date(result.endsAt)) }));
      return;
    }

    if (sub === 'bid') {
      const auctionId = Number(args[1]);
      const amount = Number(args[2]);
      if (!Number.isInteger(auctionId) || !Number.isInteger(amount) || amount <= 0) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}auction bid <id_leilao> <valor>' }));
        return;
      }
      const result = await this.api.post<{ ok: true; bought: boolean } | { ok: false; reason: string }>(
        '/internal/v1/market/auction/bid',
        { ...actor, auctionId, amount },
      );
      if (!result.ok) {
        await invocation.reply(t(`auction.${result.reason}`));
        return;
      }
      await invocation.reply(result.bought ? t('auction.bought', { amount }) : t('auction.bid_ok', { amount }));
      return;
    }

    if (sub === 'info') {
      const auctionId = Number(args[1]);
      const result = await this.api.post<{ ok: true; auction: AuctionView } | { ok: false }>(
        '/internal/v1/market/auction/info',
        { auctionId },
      );
      if (!result.ok) {
        await invocation.reply(t('auction.not_found'));
        return;
      }
      await invocation.reply({ embeds: [buildAuctionInfoEmbed(result.auction, t)] });
      return;
    }

    if (sub === 'cancel') {
      const auctionId = Number(args[1]);
      if (!Number.isInteger(auctionId)) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}auction cancel <id_leilao>' }));
        return;
      }
      const result = await this.api.post<{ ok: true } | { ok: false; reason: string }>(
        '/internal/v1/market/auction/cancel',
        { ...actor, auctionId },
      );
      await invocation.reply(result.ok ? t('auction.cancelled') : t(`auction.${result.reason}`));
      return;
    }

    const pageSize = ui.pagination.wishlistPageSize;
    const first = await this.api.post<{ total: number; rows: AuctionView[] }>('/internal/v1/market/auction/page', {
      guildId,
      page: 0,
      pageSize,
    });
    if (first.total === 0) {
      await invocation.reply(t('auction.list.empty'));
      return;
    }
    await paginate({
      invocation,
      total: first.total,
      pageSize,
      t,
      renderPage: async (page, totalPages) => {
        const { rows } = page === 0 ? first : await this.api.post<{ rows: AuctionView[] }>('/internal/v1/market/auction/page', { guildId, page, pageSize });
        return buildAuctionsEmbed(rows, { page, totalPages }, t);
      },
    });
  };
}
