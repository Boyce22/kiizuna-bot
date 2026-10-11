import { economy, ui } from '@config';
import { ButtonStyle } from 'discord.js';

import type { InternalClient } from '../client';
import { awaitConfirmation } from '../discord/confirmation';
import type { Command, CommandContext } from '../interfaces';

export class DuelCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [{ name: 'duel', aliases: ['duelo'], descriptionKey: 'command.duel.description', execute: this.handleDuel }];
  }

  private handleDuel = async (ctx: CommandContext): Promise<void> => {
    const { message, args, user, t } = ctx;
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === user.discordId) {
      await message.reply(t('duel.self'));
      return;
    }
    const wagerArg = args.find((a) => /^\d+$/.test(a));
    const wager = wagerArg ? Number(wagerArg) : economy.duel.defaultWager;
    if (wager <= 0) {
      await message.reply(t('error.missing_args', { usage: 'k!duel @user [aposta]' }));
      return;
    }
    if (user.coins < wager) {
      await message.reply(t('duel.no_coins'));
      return;
    }
    const outcome = await awaitConfirmation({
      message,
      content: t('duel.challenge', {
        challenger: `<@${user.discordId}>`,
        target: `<@${target.id}>`,
        wager,
      }),
      authorizedUserId: target.id,
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      timeoutMs: ui.timeouts.duelChallengeMs,
      idPrefix: 'duel',
      cancelStyle: ButtonStyle.Danger,
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('duel.timeout'), components: [] }).catch(() => undefined);
      return;
    }
    if (outcome.status === 'declined') {
      await outcome.interaction.update({ content: t('duel.declined'), components: [] });
      return;
    }
    const result = await this.api.post<
      { ok: true; winnerUserId: string; payout: number } | { ok: false; reason: 'no_coins' | 'no_characters' }
    >('/internal/v1/duel/resolve', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId: message.guildId,
      wager,
    });
    if (!result.ok) {
      await outcome.interaction.update({
        content: result.reason === 'no_characters' ? t('duel.no_characters') : t('duel.no_coins'),
        components: [],
      });
      return;
    }
    await outcome.interaction.update({
      content: t('duel.result', { winner: `<@${result.winnerUserId}>`, amount: result.payout }),
      components: [],
    });
  };
}
