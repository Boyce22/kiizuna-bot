import type { InternalClient } from '../client';
import type { CommandContext, CommandExecutor } from '../interfaces';

type GiftResult =
  | { ok: true; points: number; bond: number; attrs: { atk: number; speed: number; def: number }; name: string }
  | { ok: false; reason: 'min' | 'no_coins' | 'not_owned'; min?: number };

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
