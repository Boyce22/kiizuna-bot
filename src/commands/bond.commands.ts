import type { ErrorCode } from '../api-error-codes';
import type { InternalClient } from '../client';
import { refusalMessage } from '../i18n/refusal';
import type { CommandContext, CommandExecutor } from '../interfaces';
import { parseCardRef, pickOwnedCopy } from './copy-picker';

type Gift = { points: number; bond: number; attrs: { atk: number; speed: number; def: number }; name: string };
type GiftAll = { cards: number; pointsEach: number; spent: number };
type Soulmate = { name: string; tier: string };

export class BondCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      { name: 'gift', execute: this.handleGift },
      { name: 'soulmate', execute: this.handleSoulmate },
    ];
  }

  private handleGift = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    if (args[0]?.toLowerCase() === 'all') {
      await this.handleGiftAll(ctx, Number(args[1]));
      return;
    }
    const ref = parseCardRef(args[0]);
    const coins = Number(args[1]);
    if (!ref || !Number.isFinite(coins) || coins <= 0) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}gift <id_personagem | #id_cópia> <coins>' }));
      return;
    }
    const pick = await pickOwnedCopy(this.api, ctx, ref);
    if (pick.status === 'timeout') return;
    if (pick.status === 'not_owned') {
      await invocation.reply(t('gift.not_owned'));
      return;
    }

    const result = await this.api.call<Gift, { min: number }>('/internal/v1/bond/gift', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      characterId: pick.copy.characterId,
      cardId: pick.copy.cardId,
      coins,
    });
    if (!result.ok) {
      const reply: Partial<Record<ErrorCode, () => string>> = {
        NOT_OWNED: () => t('gift.not_owned'),
        MIN: () => t('gift.min', { min: result.min ?? 0 }),
        NO_COINS: () => t('gift.no_coins'),
      };
      await invocation.reply(reply[result.code]?.() ?? refusalMessage(t, 'gift', result.code));
      return;
    }

    await invocation.reply(
      t('gift.success', {
        points: result.points,
        name: result.name,
        bond: result.bond,
        atk: result.attrs.atk,
        speed: result.attrs.speed,
        def: result.attrs.def,
      }),
    );
  };

  private async handleGiftAll(ctx: CommandContext, coins: number): Promise<void> {
    const { invocation, user, t } = ctx;
    if (!Number.isInteger(coins) || coins <= 0) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}gift all <coins>' }));
      return;
    }
    const result = await this.api.call<GiftAll, { min: number }>('/internal/v1/bond/gift-all', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      coins,
    });
    if (!result.ok) {
      const reply: Partial<Record<ErrorCode, () => string>> = {
        MIN: () => t('gift.min', { min: result.min ?? 0 }),
        NO_COINS: () => t('gift.no_coins'),
        NO_CARDS: () => t('gift.no_cards'),
        BUSY: () => t('gift.all_busy'),
        VIP_REQUIRED: () => t('gift.all_vip'),
      };
      await invocation.reply(reply[result.code]?.() ?? refusalMessage(t, 'gift', result.code));
      return;
    }
    await invocation.reply(
      t('gift.all_started', { points: result.pointsEach, cards: result.cards, spent: result.spent }),
    );
  }

  private handleSoulmate = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const ref = parseCardRef(args[0]);
    if (!ref) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}soulmate <id_personagem | #id_cópia>' }));
      return;
    }
    const pick = await pickOwnedCopy(this.api, ctx, ref);
    if (pick.status === 'timeout') return;
    if (pick.status === 'not_owned') {
      await invocation.reply(t('soulmate.not_owned'));
      return;
    }

    const result = await this.api.call<Soulmate>('/internal/v1/bond/soulmate', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      characterId: pick.copy.characterId,
      cardId: pick.copy.cardId,
    });
    if (!result.ok) {
      await invocation.reply(
        result.code === 'VIP_REQUIRED'
          ? t('soulmate.vip_required')
          : result.code === 'NOT_OWNED'
            ? t('soulmate.not_owned')
            : refusalMessage(t, 'soulmate', result.code),
      );
      return;
    }
    await invocation.reply(t('soulmate.set', { name: result.name }));
  };
}
