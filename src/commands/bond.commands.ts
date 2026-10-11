import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

type GiftResult =
  | { ok: true; points: number; bond: number; attrs: { atk: number; speed: number; def: number }; name: string }
  | { ok: false; reason: 'min' | 'no_coins' | 'not_owned'; min?: number };

type GiftAllResult =
  | { ok: true; cards: number; pointsEach: number; spent: number }
  | { ok: false; reason: 'min' | 'no_coins' | 'no_cards' | 'busy' | 'vip_required'; min?: number };

type SoulmateResult =
  | { ok: true; name: string; tier: string }
  | { ok: false; reason: 'vip_required' | 'not_owned'; tier?: string };

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
    const characterId = Number(args[0]);
    const coins = Number(args[1]);
    if (!Number.isInteger(characterId) || !Number.isFinite(coins) || coins <= 0) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}gift <id_personagem> <coins>' }));
      return;
    }

    const result = await this.api.post<GiftResult>('/internal/v1/bond/gift', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      characterId,
      coins,
    });
    if (!result.ok) {
      if (result.reason === 'not_owned') {
        await invocation.reply(t('gift.not_owned'));
        return;
      }
      await invocation.reply(result.reason === 'min' ? t('gift.min', { min: result.min ?? 0 }) : t('gift.no_coins'));
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
    const result = await this.api.post<GiftAllResult>('/internal/v1/bond/gift-all', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      coins,
    });
    if (!result.ok) {
      const reply = {
        min: () => t('gift.min', { min: result.min ?? 0 }),
        no_coins: () => t('gift.no_coins'),
        no_cards: () => t('gift.no_cards'),
        busy: () => t('gift.all_busy'),
        vip_required: () => t('gift.all_vip'),
      }[result.reason]();
      await invocation.reply(reply);
      return;
    }
    await invocation.reply(
      t('gift.all_started', { points: result.pointsEach, cards: result.cards, spent: result.spent }),
    );
  }

  private handleSoulmate = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const characterId = Number(args[0]);
    if (!Number.isInteger(characterId)) {
      await invocation.reply(t('error.missing_args', { usage: '{prefix}soulmate <id_personagem>' }));
      return;
    }

    const result = await this.api.post<SoulmateResult>('/internal/v1/bond/soulmate', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      guildId: invocation.guildId,
      characterId,
    });
    if (!result.ok) {
      await invocation.reply(result.reason === 'vip_required' ? t('soulmate.vip_required') : t('soulmate.not_owned'));
      return;
    }
    await invocation.reply(t('soulmate.set', { name: result.name }));
  };
}
