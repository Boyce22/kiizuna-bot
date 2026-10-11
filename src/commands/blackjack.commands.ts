import { economy } from '@config';
import { sleep } from '@utils';

import type { InternalClient } from '../client';
import { awaitAuthorButton } from '../discord/await-button';
import type { CommandContext, CommandExecutor } from '../interfaces';

import {
  BJ_COLORS,
  BJ_HIT_ID,
  bjButtons,
  bjGameEmbed,
  bjOutcomeFooter,
  bjThumbnailFile,
  type Card,
} from './blackjack.presenter';

type BjView = {
  ok: true;
  status: 'playing' | 'finished';
  sessionId?: string;
  bet: number;
  player: Card[];
  dealer: Card[];
  playerTotal: number;
  dealerTotal: number;
  outcome?: 'win' | 'lose' | 'push' | 'blackjack';
  payout?: number;
};

type BjFail = { ok: false; reason: 'bad_bet' | 'cooldown' | 'no_coins' | 'no_session'; min?: number; max?: number; resetMs?: number };

export class BlackjackCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'blackjack', execute: this.handleBlackjack },
    ];
  }

  private handleBlackjack = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const { minBet, maxBet, roundTimeoutMs } = economy.blackjack;
    const roundSeconds = Math.ceil(roundTimeoutMs / 1000);
    const bet = Number(args[0]);
    if (!Number.isInteger(bet) || bet < minBet || bet > maxBet) {
      await invocation.reply(t('blackjack.usage', { min: minBet, max: maxBet }));
      return;
    }
    const start = await this.api.post<BjView | BjFail>('/internal/v1/games/blackjack/start', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      bet,
    });
    if (!start.ok) {
      if (start.reason === 'cooldown') await invocation.reply(t('error.cooldown', { seconds: Math.ceil((start.resetMs ?? 0) / 1000) }));
      else if (start.reason === 'no_coins') await invocation.reply(t('blackjack.no_coins'));
      else await invocation.reply(t('blackjack.usage', { min: minBet, max: maxBet }));
      return;
    }
    const thumb = bjThumbnailFile();
    const files = thumb ? [thumb] : [];
    const paint = (view: BjView, reveal: boolean, footer: string, color: number, hint?: string) =>
      bjGameEmbed({
        playerHand: view.player,
        dealerHand: view.dealer,
        playerTotal: view.playerTotal,
        dealerTotal: view.dealerTotal,
        revealDealer: reveal,
        bet: view.bet,
        footer,
        hint,
        color,
        t,
      });

    if (start.status === 'finished') {
      const outcome = start.outcome ?? 'lose';
      const color = outcome === 'blackjack' || outcome === 'win' ? BJ_COLORS.win : outcome === 'push' ? BJ_COLORS.push : BJ_COLORS.lose;
      await invocation.reply({
        embeds: [paint(start, true, bjOutcomeFooter(outcome, start.bet, start.payout ?? 0, t), color)],
        files,
      });
      return;
    }

    const prompt = await invocation.reply({
      files,
      embeds: [paint(start, false, t('blackjack.your_turn', { seconds: roundSeconds }), BJ_COLORS.playerTurn, t('blackjack.rules'))],
      components: [bjButtons(t, false)],
    });
    const deadline = Date.now() + roundTimeoutMs;
    let timedOut = false;
    let view: BjView = start;
    for (;;) {
      let interaction;
      try {
        interaction = await awaitAuthorButton(prompt, user.discordId, deadline, t);
      } catch {
        timedOut = true;
        break;
      }
      if (interaction.customId === BJ_HIT_ID) {
        const hit = await this.api.post<BjView | BjFail>('/internal/v1/games/blackjack/hit', {
          discordId: user.discordId,
          sessionId: view.sessionId,
        });
        if (!hit.ok) {
          await interaction.update({ content: t('error.generic'), components: [] });
          return;
        }
        if (hit.status === 'finished') {
          await interaction.update({
            embeds: [paint(hit, true, bjOutcomeFooter(hit.outcome ?? 'lose', hit.bet, hit.payout ?? 0, t), BJ_COLORS.lose)],
            components: [bjButtons(t, true)],
          });
          return;
        }
        view = hit;
        await interaction.update({
          embeds: [paint(view, false, t('blackjack.your_turn', { seconds: roundSeconds }), BJ_COLORS.playerTurn, t('blackjack.rules'))],
          components: [bjButtons(t, false)],
        });
        continue;
      }
      await interaction.update({
        embeds: [paint(view, false, t('blackjack.dealer_turn'), BJ_COLORS.playerTurn)],
        components: [bjButtons(t, true)],
      });
      break;
    }
    if (timedOut) {
      await prompt
        .edit({
          embeds: [paint(view, false, t('blackjack.timed_out'), BJ_COLORS.playerTurn)],
          components: [bjButtons(t, true)],
        })
        .catch(() => undefined);
    }
    await sleep(1_000);
    const stand = await this.api.post<BjView | BjFail>('/internal/v1/games/blackjack/stand', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      sessionId: view.sessionId,
    });
    if (!stand.ok || stand.status !== 'finished') {
      await prompt.edit({ content: t('error.generic'), components: [] }).catch(() => undefined);
      return;
    }
    const outcome = stand.outcome ?? 'lose';
    const color =
      outcome === 'win' || outcome === 'blackjack' ? BJ_COLORS.win : outcome === 'push' ? BJ_COLORS.push : BJ_COLORS.lose;
    await prompt.edit({
      embeds: [paint(stand, true, bjOutcomeFooter(outcome, stand.bet, stand.payout ?? 0, t), color)],
      components: [bjButtons(t, true)],
    });
  };
}
