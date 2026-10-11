import { economy } from '@config';

import type { InternalClient } from '../client';
import { awaitAuthorButton } from '../discord/await-button';
import type { Command, CommandContext } from '../interfaces';

import { hlBustEmbed, hlButtons, hlCashoutEmbed, type HlCard, hlPlayEmbed } from './hl.presenter';

type HlStart =
  | { ok: true; sessionId: string; current: HlCard; next: HlCard; streak: number; earned: number }
  | { ok: false; reason: 'cooldown' | 'empty_pool'; resetMs?: number };

export class HigherLowerCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      { name: 'higherlower', aliases: ['hl', 'maiormenor'], descriptionKey: 'command.higherlower.description', execute: this.handleHigherLower },
    ];
  }

  private handleHigherLower = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const start = await this.api.post<HlStart>('/internal/v1/games/hl/start', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
    });
    if (!start.ok) {
      if (start.reason === 'cooldown') {
        await message.reply(t('error.cooldown', { seconds: Math.ceil((start.resetMs ?? 0) / 1000) }));
        return;
      }
      await message.reply(t('error.generic'));
      return;
    }
    const { roundTimeoutMs, maxRounds } = economy.higherLower;
    let current = start.current;
    let next = start.next;
    let streak = start.streak;
    let earned = start.earned;
    let busted = false;
    let timedOut = false;
    const prompt = await message.reply({
      embeds: [hlPlayEmbed(current, next, streak, earned, t)],
      components: [hlButtons(t, false)],
    });
    for (let round = 0; round < maxRounds; round++) {
      let interaction;
      try {
        interaction = await awaitAuthorButton(prompt, user.discordId, Date.now() + roundTimeoutMs, t);
      } catch {
        timedOut = true;
        break;
      }
      if (interaction.customId === 'hl_stop') {
        await interaction.update({
          embeds: [hlCashoutEmbed(current, next, streak, earned, t)],
          components: [hlButtons(t, true)],
        });
        break;
      }
      const guess = await this.api.post<{
        ok: true;
        busted: boolean;
        prev: { current: HlCard; next: HlCard };
        current: HlCard;
        next: HlCard;
        streak: number;
        earned: number;
      } | { ok: false }>('/internal/v1/games/hl/guess', {
        discordId: user.discordId,
        sessionId: start.sessionId,
        higher: interaction.customId === 'hl_higher',
      });
      if (!guess.ok) {
        await interaction.update({ content: t('error.generic'), components: [] });
        return;
      }
      if (guess.busted) {
        busted = true;
        await interaction.update({
          embeds: [hlBustEmbed(guess.prev.current, guess.prev.next, t)],
          components: [hlButtons(t, true)],
        });
        break;
      }
      current = guess.current;
      next = guess.next;
      streak = guess.streak;
      earned = guess.earned;
      await interaction.update({
        embeds: [hlPlayEmbed(current, next, streak, earned, t)],
        components: [hlButtons(t, false)],
      });
    }
    if (timedOut) {
      await prompt
        .edit({
          embeds: [hlCashoutEmbed(current, next, streak, earned, t)],
          components: [hlButtons(t, true)],
        })
        .catch(() => undefined);
    }
    const cash = await this.api.post<{ payout: number; busted: boolean; streak: number; earned: number }>(
      '/internal/v1/games/hl/cashout',
      { discordId: user.discordId, username: user.username ?? undefined, sessionId: start.sessionId },
    );
    if (cash.payout > 0 && message.channel.isSendable()) {
      const key = cash.busted ? 'hl.bust_payout' : 'hl.payout';
      await message.channel
        .send(t(key, { user: `<@${user.discordId}>`, streak: cash.streak, amount: cash.payout, banked: cash.earned }))
        .catch(() => undefined);
    } else if (cash.earned === 0) {
      await prompt.edit({ components: [hlButtons(t, true)] }).catch(() => undefined);
    }
  };
}
