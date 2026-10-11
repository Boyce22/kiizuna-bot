import type { InternalClient } from '../client';
import { awaitConfirmation } from '../discord/confirmation';
import type { Command, CommandContext } from '../interfaces';

export class SellCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [{ name: 'sell', aliases: ['vender'], descriptionKey: 'command.sell.description', execute: this.handleSell }];
  }

  private handleSell = async (ctx: CommandContext): Promise<void> => {
    const { message, args, user, t } = ctx;
    const characterId = Number(args[0]);
    if (!Number.isInteger(characterId)) {
      await message.reply(t('error.missing_args', { usage: 'k!sell <id_personagem>' }));
      return;
    }
    const owned = await this.api.post<
      { ok: true; name: string; kizunaPrice: number } | { ok: false; reason: 'not_owned' }
    >('/internal/v1/harem/owned', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
      characterId,
    });
    if (!owned.ok) {
      await message.reply(t('sell.not_owned'));
      return;
    }
    const outcome = await awaitConfirmation({
      message,
      content: t('sell.confirm', { name: owned.name, price: owned.kizunaPrice }),
      authorizedUserId: user.discordId,
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
      timeoutMs: 30_000,
      idPrefix: 'sell',
    });
    if (outcome.status === 'timeout') {
      await outcome.prompt.edit({ content: t('sell.cancelled'), components: [] }).catch(() => undefined);
      return;
    }
    if (outcome.status === 'declined') {
      await outcome.interaction.update({ content: t('sell.cancelled'), components: [] });
      return;
    }
    const result = await this.api.post<
      { ok: true; price: number; name: string } | { ok: false; reason: 'locked' | 'not_owned' }
    >('/internal/v1/market/sell-kizuna', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: message.guildId,
      characterId,
    });
    await outcome.interaction.update({
      content: result.ok ? t('sell.done', { name: result.name, price: result.price }) : t('sell.locked'),
      components: [],
    });
  };
}
