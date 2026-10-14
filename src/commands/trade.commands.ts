import { readFlag } from '@utils';
import { ButtonStyle } from 'discord.js';

import type { InternalClient } from '../client';
import { refusalMessage } from '../i18n/refusal';
import { awaitConfirmation } from '../discord/confirmation';
import { awaitSelection } from '../discord/selection';
import type { CommandContext, CommandExecutor } from '../interfaces';

const MINE_FLAGS = new Set(['meu', 'mine', 'mio', 'mío']);
const THEIRS_FLAGS = new Set(['dele', 'theirs', 'suyo']);

interface OwnedMatch {
  characterId: number;
  name: string;
  rarity: string;
  series: string | null;
}

export class TradeCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'trade', execute: this.handleTrade }];
  }

  private handleTrade = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, flags, user, t } = ctx;
    const guildId = invocation.guildId!;
    const target = invocation.mentions.users.first();
    if (!target || target.bot || target.id === user.discordId) {
      await invocation.reply(t('trade.self'));
      return;
    }
    const mineFlag = readFlag(flags, MINE_FLAGS);
    const theirsFlag = readFlag(flags, THEIRS_FLAGS);
    let mineToken: string;
    let theirsToken: string;
    if (mineFlag || theirsFlag) {
      if (!mineFlag || !theirsFlag) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}trade @user --meu <id ou nome> --dele <id ou nome>' }));
        return;
      }
      mineToken = mineFlag;
      theirsToken = theirsFlag;
    } else {
      const ids = args.filter((a) => /^\d+$/.test(a));
      if (ids.length < 2) {
        await invocation.reply(t('error.missing_args', { usage: '{prefix}trade @user <meu_id> <id_dele> (ou --meu <nome> --dele <nome>)' }));
        return;
      }
      [mineToken, theirsToken] = ids;
    }

    const mine = await this.resolveToken(ctx, user.discordId, user.username, mineToken, 'trade.MINE_NOT_OWNED');
    if (!mine) return;
    const theirs = await this.resolveToken(ctx, target.id, target.username, theirsToken, 'trade.THEIRS_NOT_OWNED', {
      user: target.username,
    });
    if (!theirs) return;

    const outcome = await awaitConfirmation({
      invocation,
      content: t('trade.request', {
        from: `<@${user.discordId}>`,
        to: `<@${target.id}>`,
        mine: mine.name,
        theirs: theirs.name,
      }),
      authorizedUserId: target.id,
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      timeoutMs: 60_000,
      idPrefix: 'trade',
      cancelStyle: ButtonStyle.Danger,
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('trade.timeout'), components: [] }).catch(() => undefined);
      return;
    }
    if (outcome.status === 'declined') {
      await outcome.interaction.update({ content: t('trade.declined'), components: [] });
      return;
    }
    const result = await this.api.call('/internal/v1/market/trade', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId,
      mineCharacterId: mine.characterId,
      theirsCharacterId: theirs.characterId,
    });
    await outcome.interaction.update({
      content: result.ok ? t('trade.done') : refusalMessage(t, 'trade', result.code),
      components: [],
    });
  };

  private async resolveToken(
    ctx: CommandContext,
    discordId: string,
    username: string | undefined,
    token: string,
    notOwnedKey: string,
    vars?: Record<string, string | number>,
  ): Promise<OwnedMatch | null> {
    const { invocation, t } = ctx;
    const guildId = invocation.guildId!;
    if (/^\d+$/.test(token)) {
      const owned = await this.api.call<OwnedMatch>('/internal/v1/harem/owned', {
        discordId,
        username,
        guildId,
        characterId: Number(token),
      });
      if (!owned.ok) {
        await invocation.reply(t(notOwnedKey, vars));
        return null;
      }
      return owned;
    }
    const { matches } = await this.api.post<{ matches: OwnedMatch[] }>('/internal/v1/harem/owned-by-name', {
      discordId,
      username,
      guildId,
      name: token,
    });
    if (matches.length === 0) {
      await invocation.reply(t(notOwnedKey, vars));
      return null;
    }
    if (matches.length === 1) return matches[0];
    const outcome = await awaitSelection({
      invocation,
      content: t('trade.pick_prompt'),
      placeholder: t('trade.pick_placeholder'),
      options: matches.map((h) => ({
        label: h.name.slice(0, 100),
        description: (h.series ?? t('trade.unknown_series')).slice(0, 100),
        value: h,
      })),
      authorizedUserId: invocation.author.id,
      timeoutMs: 60_000,
      idPrefix: 'trade_pick',
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('trade.pick_timeout'), components: [] }).catch(() => undefined);
      return null;
    }
    await outcome.interaction.update({ content: t('trade.picked', { name: outcome.value.name }), components: [] });
    return outcome.value;
  };
}
