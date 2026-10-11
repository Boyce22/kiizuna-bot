import { EmbedBuilder, MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import type { Command, CommandContext } from '../interfaces';

import { buildRanksContainer } from './ranks.presenter';

const METRICS: Record<string, 'harem' | 'bond' | 'mythics'> = {
  harem: 'harem',
  bond: 'bond',
  mythics: 'mythics',
  mythic: 'mythics',
};

export class GlobalCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): Command[] {
    return [
      { name: 'globalprofile', aliases: ['gp', 'gprofile'], descriptionKey: 'command.globalprofile.description', execute: this.handleGlobalProfile },
      { name: 'globaltop', aliases: ['gtop'], descriptionKey: 'command.globaltop.description', execute: this.handleGlobalTop },
      { name: 'globalhide', aliases: ['ghide'], descriptionKey: 'command.globalhide.description', execute: this.handleGlobalHide },
      { name: 'ranks', aliases: ['rank'], descriptionKey: 'command.ranks.description', execute: this.handleRanks },
      { name: 'showcase', aliases: ['vitrine'], descriptionKey: 'command.showcase.description', execute: this.handleShowcase },
    ];
  }

  private handleGlobalProfile = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const targetUser = message.mentions.users.first() ?? message.author;
    const targetName =
      message.mentions.members?.first()?.displayName ?? message.member?.displayName ?? targetUser.username;
    const data = await this.api.post<{
      coins: number;
      peakRank: number;
      rank: { key: string; emoji: string };
      total: number;
      totalBond: number;
      mythics: number;
      favorite: { name: string; rarity: string } | null;
    }>('/internal/v1/global/profile', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: targetUser.id,
      targetUsername: targetUser.username,
    });
    const rankName = `${data.rank.emoji} ${t(`rank.${data.rank.key}.name`)}`;
    const embed = new EmbedBuilder()
      .setTitle(t('globalprofile.title', { user: targetName }))
      .addFields(
        { name: t('profile.coins'), value: String(data.coins), inline: true },
        {
          name: t('globalprofile.collection'),
          value: t('globalprofile.collection_value', { total: data.total, bond: data.totalBond, mythics: data.mythics }),
          inline: true,
        },
        { name: t('globalprofile.rank'), value: t('globalprofile.rank_value', { rank: rankName, peak: data.peakRank }), inline: true },
        {
          name: t('globalprofile.favorite'),
          value: data.favorite
            ? `**${data.favorite.name}** (${t(`common.rarity.${data.favorite.rarity}`)})`
            : t('profile.favorite_none'),
          inline: false,
        },
      );
    await message.reply({ embeds: [embed] });
  };

  private handleGlobalTop = async (ctx: CommandContext): Promise<void> => {
    const { message, args, t } = ctx;
    const metric = METRICS[(args[0] ?? 'harem').toLowerCase()] ?? 'harem';
    const { rows } = await this.api.post<{ rows: Array<{ rank: number; value: number; discordId: string }> }>(
      '/internal/v1/global/top',
      { metric },
    );
    if (rows.length === 0) {
      await message.reply(t('globaltop.empty'));
      return;
    }
    const lines = rows.map((r) => `\`#${r.rank}\` <@${r.discordId}> — **${r.value}**`);
    await message.reply({
      embeds: [new EmbedBuilder().setTitle(t(`globaltop.title.${metric}`)).setDescription(lines.join('\n'))],
    });
  };

  private handleGlobalHide = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const { globalPrivacy } = await this.api.post<{ globalPrivacy: boolean }>('/internal/v1/users/privacy', {
      discordId: user.discordId,
      username: user.username ?? undefined,
    });
    await message.reply(globalPrivacy ? t('globalhide.on') : t('globalhide.off'));
  };

  private handleRanks = async (ctx: CommandContext): Promise<void> => {
    const { message, user, t } = ctx;
    const container = buildRanksContainer(user.globalRank, t);
    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  };

  private handleShowcase = async (ctx: CommandContext): Promise<void> => {
    const { message, args, user, t } = ctx;
    const sub = (args[0] ?? '').toLowerCase();
    if (sub === 'set') {
      const characterId = Number(args[1]);
      const position = args[2] && /^\d+$/.test(args[2]) ? Number(args[2]) : undefined;
      if (!Number.isInteger(characterId)) {
        await message.reply(t('error.missing_args', { usage: 'k!showcase set <id_personagem> [posição]' }));
        return;
      }
      const result = await this.api.post<{ ok: true; position: number } | { ok: false; reason: string }>(
        '/internal/v1/global/showcase',
        {
          discordId: user.discordId,
          username: user.username ?? undefined,
          guildId: message.guildId,
          action: 'set',
          characterId,
          position,
        },
      );
      await message.reply(result.ok ? t('showcase.set', { position: result.position }) : t(`showcase.${result.reason}`));
      return;
    }
    if (sub === 'remove') {
      const position = Number(args[1]);
      if (!Number.isInteger(position)) {
        await message.reply(t('error.missing_args', { usage: 'k!showcase remove <posição>' }));
        return;
      }
      const result = await this.api.post<{ ok: boolean }>('/internal/v1/global/showcase', {
        discordId: user.discordId,
        username: user.username ?? undefined,
        guildId: message.guildId,
        action: 'remove',
        position,
      });
      await message.reply(result.ok ? t('showcase.removed') : t('showcase.not_found'));
      return;
    }
    const targetUser = message.mentions.users.first() ?? message.author;
    const targetName =
      message.mentions.members?.first()?.displayName ?? message.member?.displayName ?? targetUser.username;
    const { entries } = await this.api.post<{
      entries: Array<{ position: number; name: string; rarity: string; servers: number }>;
    }>('/internal/v1/global/showcase', {
      discordId: user.discordId,
      username: user.username ?? undefined,
      targetDiscordId: targetUser.id,
      targetUsername: targetUser.username,
      guildId: message.guildId,
      action: 'get',
    });
    if (entries.length === 0) {
      await message.reply(t('showcase.empty'));
      return;
    }
    const lines = entries.map(
      (slot) =>
        `\`${slot.position}.\` **${slot.name}** · ${t(`common.rarity.${slot.rarity}`)} · ${t('showcase.servers', { count: slot.servers })}`,
    );
    await message.reply({
      embeds: [new EmbedBuilder().setTitle(t('showcase.title', { user: targetName })).setDescription(lines.join('\n'))],
    });
  };
}
