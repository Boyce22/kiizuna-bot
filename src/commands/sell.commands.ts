import type { InternalClient } from '../client';
import { awaitConfirmation } from '../discord/confirmation';
import type { CommandContext, CommandExecutor } from '../interfaces';
import { parseCardRef, pickOwnedCopy } from './copy-picker';

export class SellCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [{ name: 'sell', execute: this.handleSell }];
  }

  private handleSell = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const ref = parseCardRef(args[0]);
    if (!ref) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}sell <id_personagem | #id_cópia>' }));
      return;
    }
    const pick = await pickOwnedCopy(this.api, ctx, ref);
    if (pick.status === 'timeout') return;
    if (pick.status === 'not_owned') {
      await invocation.reply(t('sell.not_owned'));
      return;
    }
    const owned = pick.copy;
    const outcome = await awaitConfirmation({
      invocation,
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
    const result = await this.api.call<{ price: number; name: string }>('/internal/v1/market/sell-kizuna', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      characterId: owned.characterId,
      cardId: owned.cardId,
    });
    await outcome.interaction.update({
      content: result.ok ? t('sell.done', { name: result.name, price: result.price }) : t('sell.locked'),
      components: [],
    });
  };
}
