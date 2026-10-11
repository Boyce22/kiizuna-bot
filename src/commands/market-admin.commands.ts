import { isBotOwner } from '@utils';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

export class MarketAdminCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      {
        name: 'market-admin',
        aliases: ['marketadmin', 'mercado-admin'],
        descriptionKey: 'command.marketAdmin.description',
        execute: this.handleMarketAdmin,
      },
    ];
  }

  private handleMarketAdmin = async (ctx: CommandContext): Promise<void> => {
    const { message, args, user, t } = ctx;
    if (!isBotOwner(user.discordId)) {
      await message.reply(t('error.not_owner'));
      return;
    }
    const sub = (args[0] ?? '').toLowerCase();
    const guildId = message.guildId!;
    if (sub === 'add' || sub === 'adicionar') {
      const characterId = Number(args[1]);
      const priceArg = Number(args[2]);
      if (!Number.isInteger(characterId) || characterId <= 0) {
        await message.reply(t('error.missing_args', { usage: 'k!market-admin add <id_personagem> [preço]' }));
        return;
      }
      const result = await this.api.post<
        { ok: true; characterName: string; stockId: number; price: number } | { ok: false; reason: string }
      >('/internal/v1/market/admin/stock', {
        actorDiscordId: user.discordId,
        guildId,
        action: 'add',
        characterId,
        price: Number.isInteger(priceArg) && priceArg > 0 ? priceArg : undefined,
      });
      if (!result.ok) {
        await message.reply(t(`marketAdmin.${result.reason}`, { id: characterId }));
        return;
      }
      await message.reply(t('marketAdmin.added', { name: result.characterName, id: result.stockId, price: result.price }));
      return;
    }
    if (sub === 'remove' || sub === 'remover' || sub === 'rm') {
      const stockId = Number(args[1]);
      if (!Number.isInteger(stockId) || stockId <= 0) {
        await message.reply(t('error.missing_args', { usage: 'k!market-admin remove <id_estoque>' }));
        return;
      }
      const result = await this.api.post<{ ok: true } | { ok: false }>('/internal/v1/market/admin/stock', {
        actorDiscordId: user.discordId,
        guildId,
        action: 'remove',
        stockId,
      });
      await message.reply(result.ok ? t('marketAdmin.removed', { id: stockId }) : t('marketAdmin.not_found', { id: stockId }));
      return;
    }
    if (sub === 'list') {
      const { rows } = await this.api.post<{ rows: Array<{ id: number; characterName: string; rarity: string; price: number }> }>(
        '/internal/v1/market/admin/stock',
        { actorDiscordId: user.discordId, guildId, action: 'list' },
      );
      if (rows.length === 0) {
        await message.reply(t('market.list.empty'));
        return;
      }
      const lines = rows.map(
        (r) => `\`#${r.id}\` **${r.characterName}** · ${t(`common.rarity.${r.rarity}`)} — 💰 **${r.price}**`,
      );
      await message.reply([t('marketAdmin.list_title', { count: rows.length }), ...lines].join('\n'));
      return;
    }
    await message.reply(
      t('error.missing_args', { usage: 'k!market-admin add <id_personagem> [preço] | list | remove <id_estoque>' }),
    );
  };
}
