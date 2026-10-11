import { ui } from '@config';
import { paginate, readFlag } from '@utils';
import type { Message } from 'discord.js';

import type { InternalClient } from '../client';
import { awaitConfirmation } from '../discord/confirmation';
import { awaitSelection } from '../discord/selection';
import type { Command, CommandContext, TranslateFn } from '../interfaces';

import { buildWishlistEmbed } from './wishlist.presenter';

const NAME_FLAGS = new Set(['name', 'nome']);
const SERIES_FLAGS = new Set(['anime', 'series', 'serie']);

type Candidate = { id: number; name: string; series: string | null; rarity: string; type: string };

export class WishlistCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      { name: 'wishlist', aliases: ['wl', 'desejos'], descriptionKey: 'command.wishlist.description', execute: this.handleWishlist },
    ];
  }

  private handleWishlist = async (ctx: CommandContext): Promise<void> => {
    const { message, args, flags, user, t } = ctx;
    const guildId = message.guildId!;
    const sub = (args[0] ?? 'list').toLowerCase();

    if (sub === 'clear' || sub === 'limpar') {
      const { count } = await this.api.post<{ count: number }>('/internal/v1/wishlist/count', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        guildId,
      });
      if (count === 0) {
        await message.reply(t('wishlist.clear.empty'));
        return;
      }

      const outcome = await awaitConfirmation({
        message,
        content: t('wishlist.clear.confirm', { count }),
        authorizedUserId: user.discordId,
        confirmLabel: t('common.confirm'),
        cancelLabel: t('common.cancel'),
        timeoutMs: 30_000,
        idPrefix: 'wl_clear',
      });

      if (outcome.status !== 'confirmed') {
        const content = t('wishlist.clear.cancelled');
        if (outcome.status === 'timeout') {
          await outcome.prompt.edit({ content, components: [] }).catch(() => undefined);
        } else {
          await outcome.interaction.update({ content, components: [] });
        }
        return;
      }

      const { removed } = await this.api.post<{ removed: number }>('/internal/v1/wishlist/mutate', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        guildId,
        action: 'clear',
      });
      await outcome.interaction.update({ content: t('wishlist.clear.done', { count: removed }), components: [] });
      return;
    }

    if (sub === 'add' || sub === 'remove') {
      const nameFlag = readFlag(flags, NAME_FLAGS);
      const seriesFlag = readFlag(flags, SERIES_FLAGS);
      const name = (nameFlag ?? args.slice(1).join(' ')).trim();
      if (!name) {
        await message.reply(t('wishlist.usage'));
        return;
      }

      const { candidates } = await this.api.post<{ candidates: Candidate[] }>(
        '/internal/v1/characters/search',
        { query: name, series: seriesFlag },
      );
      if (candidates.length === 0) {
        const series = seriesFlag ? t('wishlist.char_not_found_series_suffix', { series: seriesFlag }) : '';
        await message.reply(t('wishlist.char_not_found', { name, series }));
        return;
      }

      const finalize = async (character: Candidate): Promise<string> => {
        if (sub === 'add') {
          const data = await this.api.post<{ result: string; max: number }>('/internal/v1/wishlist/mutate', {
            discordId: user.discordId,
            username: user.username ?? undefined,
            guildId,
            action: 'add',
            characterId: character.id,
          });
          const key = data.result === 'added' ? 'wishlist.added' : `wishlist.${data.result}`;
          return t(key, { name: character.name, max: data.max });
        }
        const data = await this.api.post<{ result: string }>('/internal/v1/wishlist/mutate', {
          discordId: user.discordId,
          username: user.username ?? undefined,
          guildId,
          action: 'remove',
          characterId: character.id,
        });
        const key = data.result === 'removed' ? 'wishlist.removed' : 'wishlist.not_found';
        return t(key, { name: character.name });
      };

      if (candidates.length === 1) {
        await message.reply(await finalize(candidates[0]));
        return;
      }

      await this.pickCandidate(message, candidates, t, finalize);
      return;
    }

    const pageSize = ui.pagination.wishlistPageSize;
    const targetName = message.member?.displayName ?? message.author.username;
    type Page = {
      total: number;
      entries: { characterId: number; character: { id: number; name: string; series: string | null; rarity: string; type: string } | null }[];
    };
    const first = await this.api.post<Page>('/internal/v1/wishlist/page', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId,
      page: 0,
      pageSize,
    });
    if (first.total === 0) {
      await message.reply(t('wishlist.list.empty'));
      return;
    }

    await paginate({
      message,
      total: first.total,
      pageSize,
      t,
      renderPage: async (page, totalPages) => {
        const data =
          page === 0
            ? first
            : await this.api.post<Page>('/internal/v1/wishlist/page', {
                discordId: user.discordId,
                username: user.username ?? undefined,
                guildId,
                page,
                pageSize,
              });
        return buildWishlistEmbed(data.entries, { targetName, page, totalPages, offset: page * pageSize }, t);
      },
    });
  };

  private async pickCandidate(
    message: Message,
    candidates: Candidate[],
    t: TranslateFn,
    finalize: (character: Candidate) => Promise<string>,
  ): Promise<void> {
    const outcome = await awaitSelection({
      message,
      content: t('wishlist.pick_prompt'),
      placeholder: t('wishlist.pick_placeholder'),
      options: candidates.map((c) => ({
        label: c.name.slice(0, 100),
        description: (c.series ?? t('wishlist.unknown_series')).slice(0, 100),
        value: c,
      })),
      authorizedUserId: message.author.id,
      timeoutMs: 60_000,
      idPrefix: 'wl_pick',
    });

    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('wishlist.pick_timeout'), components: [] }).catch(() => undefined);
      return;
    }

    await outcome.interaction.deferUpdate();
    await outcome.interaction.editReply({ content: await finalize(outcome.value), components: [] });
  }
}
