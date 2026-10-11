import { discordRelative, isBotOwner } from '@utils';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

/**
 * Camada de comando do módulo economy. Regras na API interna; aqui só I/O Discord.
 */
export class EconomyCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      { name: 'coins', aliases: ['c', 'balance'], descriptionKey: 'command.coins.description', execute: this.handleCoins },
      { name: 'daily', aliases: ['tribute'], descriptionKey: 'command.tribute.description', execute: this.handleTribute },
    ];
  }

  private handleCoins = async (ctx: CommandContext): Promise<void> => {
    const { message, args, user, t } = ctx;
    const sub = (args[0] ?? '').toLowerCase();

    if (!['give', 'add', 'take', 'remove', 'clear', 'zerar'].includes(sub)) {
      const { coins } = await this.api.post<{ coins: number }>('/internal/v1/economy/balance', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        guildId: message.guildId,
      });
      await message.reply(t('coins.balance', { amount: coins }));
      return;
    }

    if (!isBotOwner(user.discordId)) {
      await message.reply(t('error.not_owner'));
      return;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.reply(t('coins.admin.usage'));
      return;
    }

    const mention = `<@${target.id}>`;
    const action = sub === 'clear' || sub === 'zerar' ? 'zero' : sub === 'take' || sub === 'remove' ? 'take' : 'give';
    const amount = action === 'zero' ? undefined : Number(args.find((a) => /^\d+$/.test(a)));
    if (action !== 'zero' && (!Number.isInteger(amount) || (amount ?? 0) <= 0)) {
      await message.reply(t('coins.admin.usage'));
      return;
    }

    const result = await this.api.post<{ coins: number }>('/internal/v1/economy/admin/coins', {
      actorDiscordId: user.discordId,
      targetDiscordId: target.id,
      targetUsername: target.username,
      guildId: message.guildId,
      action,
      amount,
    });

    if (action === 'zero') {
      await message.reply(t('coins.admin.cleared', { user: mention }));
      return;
    }
    const key = action === 'take' ? 'coins.admin.took' : 'coins.admin.gave';
    await message.reply(t(key, { amount: amount ?? 0, user: mention, balance: result.coins }));
  };

  private handleTribute = async (ctx: CommandContext): Promise<void> => {
    const { user, t, message } = ctx;
    const result = await this.api.post<
      | { ok: true; amount: number; streak: number; coins: number }
      | { ok: false; reason: 'already_claimed'; nextAt: string }
    >('/internal/v1/economy/tribute', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
    });

    if (!result.ok) {
      await message.reply(t('tribute.already', { time: discordRelative(new Date(result.nextAt)) }));
      return;
    }
    await message.reply(t('tribute.claimed', { amount: result.amount, streak: result.streak }));
  };
}
