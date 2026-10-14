import { discordRelative, isBotOwner } from '@utils';

import type { InternalClient } from '../client';
import { refusalMessage } from '../i18n/refusal';
import type { CommandContext, CommandExecutor } from '../interfaces';

/**
 * Camada de comando do módulo economy. Regras na API interna; aqui só I/O Discord.
 */
export class EconomyCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'coins', execute: this.handleCoins },
      { name: 'daily', execute: this.handleTribute },
    ];
  }

  private handleCoins = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const sub = (args[0] ?? '').toLowerCase();

    if (!['give', 'add', 'take', 'remove', 'clear', 'zerar'].includes(sub)) {
      const { coins } = await this.api.post<{ coins: number }>('/internal/v1/economy/balance', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        guildId: invocation.guildId,
      });
      await invocation.reply(t('coins.balance', { amount: coins }));
      return;
    }

    if (!isBotOwner(user.discordId)) {
      await invocation.reply(t('error.not_owner'));
      return;
    }

    const target = invocation.mentions.users.first();
    if (!target) {
      await invocation.reply(t('coins.admin.usage'));
      return;
    }

    const mention = `<@${target.id}>`;
    const action = sub === 'clear' || sub === 'zerar' ? 'zero' : sub === 'take' || sub === 'remove' ? 'take' : 'give';
    const amount = action === 'zero' ? undefined : Number(args.find((a) => /^\d+$/.test(a)));
    if (action !== 'zero' && (!Number.isInteger(amount) || (amount ?? 0) <= 0)) {
      await invocation.reply(t('coins.admin.usage'));
      return;
    }

    const result = await this.api.post<{ coins: number }>('/internal/v1/economy/admin/coins', {
      actorDiscordId: user.discordId,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId: invocation.guildId,
      action,
      amount,
    });

    if (action === 'zero') {
      await invocation.reply(t('coins.admin.cleared', { user: mention }));
      return;
    }
    const key = action === 'take' ? 'coins.admin.took' : 'coins.admin.gave';
    await invocation.reply(t(key, { amount: amount ?? 0, user: mention, balance: result.coins }));
  };

  private handleTribute = async (ctx: CommandContext): Promise<void> => {
    const { user, t, invocation } = ctx;
    const result = await this.api.call<{ amount: number; streak: number; coins: number }, { nextAt: string }>('/internal/v1/economy/tribute', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
    });

    if (!result.ok) {
      await invocation.reply(
        result.code === 'ALREADY_CLAIMED' && result.nextAt
          ? t('tribute.already', { time: discordRelative(new Date(result.nextAt)) })
          : refusalMessage(t, 'tribute', result.code),
      );
      return;
    }
    await invocation.reply(t('tribute.claimed', { amount: result.amount, streak: result.streak }));
  };
}
