import { discordRelative } from '@utils';

import type { ApiFailure, InternalClient } from '../client';
import { refusalMessage } from '../i18n/refusal';
import { awaitSelection } from '../discord/selection';
import type { CommandContext, CommandExecutor, TranslateFn } from '../interfaces';

export class AnimeWishlistCommands {
  constructor(private readonly api: InternalClient) {}

  /** LOCKED traz até quando a troca está travada; outros códigos usam a mensagem genérica. */
  private refusal(t: TranslateFn, result: ApiFailure<{ unlocksAt: string }>): string {
    if (result.code === 'LOCKED' && result.unlocksAt)
      return t('animewishlist.locked', { time: discordRelative(new Date(result.unlocksAt)) });
    return refusalMessage(t, 'animewishlist', result.code);
  }

  get commands(): CommandExecutor[] {
    return [
      {
        name: 'animewishlist',
        execute: this.handleAnimeWishlist,
      },
    ];
  }

  private handleAnimeWishlist = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const guildId = invocation.guildId!;
    const actor = { discordId: user.discordId, username: user.username ?? undefined, guildId };

    if (args.length === 0) {
      const status = await this.api.post<{ series: string | null; unlocksAt: string | null }>(
        '/internal/v1/anime-wishlist/status',
        actor,
      );
      if (!status.series) {
        await invocation.reply(t('animewishlist.not_set'));
        return;
      }
      const key = status.unlocksAt ? 'animewishlist.current_locked' : 'animewishlist.current';
      await invocation.reply(t(key, { series: status.series, time: status.unlocksAt ? discordRelative(new Date(status.unlocksAt)) : '' }));
      return;
    }

    if (new Set(['clear', 'limpar']).has(args[0].toLowerCase())) {
      const result = await this.api.call<{ series: string | null }, { unlocksAt: string }>(
        '/internal/v1/anime-wishlist/set',
        { ...actor, series: null },
      );
      await invocation.reply(result.ok ? t('animewishlist.cleared') : this.refusal(t, result));
      return;
    }

    const query = args.join(' ').trim();
    const { matches } = await this.api.post<{ matches: string[] }>('/internal/v1/gacha/series', { query });
    if (matches.length === 0) {
      await invocation.reply(t('animewishlist.series_not_found', { series: query }));
      return;
    }

    const finalize = async (series: string): Promise<string> => {
      const result = await this.api.call<{ series: string | null }, { unlocksAt: string }>(
        '/internal/v1/anime-wishlist/set',
        { ...actor, series },
      );
      return result.ok ? t('animewishlist.set', { series }) : this.refusal(t, result);
    };

    if (matches.length === 1) {
      await invocation.reply(await finalize(matches[0]));
      return;
    }

    const outcome = await awaitSelection({
      invocation,
      content: t('animewishlist.pick_prompt'),
      placeholder: t('animewishlist.pick_placeholder'),
      options: matches.map((series) => ({ label: series, value: series })),
      authorizedUserId: invocation.author.id,
      timeoutMs: 60_000,
      idPrefix: 'aw_pick',
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('animewishlist.pick_timeout'), components: [] }).catch(() => undefined);
      return;
    }
    await outcome.interaction.deferUpdate();
    await outcome.interaction.editReply({ content: await finalize(outcome.value), components: [] });
  };
}
