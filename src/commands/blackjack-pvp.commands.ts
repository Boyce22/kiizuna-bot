import { economy } from '@config';
import { ComponentType, MessageFlags } from 'discord.js';

import type { InternalClient } from '../client';
import { awaitAuthorButton } from '../discord/await-button';
import type { CommandContext, CommandExecutor } from '../interfaces';

import {
  BJ_COLORS,
  BJ_HIT_ID,
  bjButtons,
  bjThumbnailFile,
  type Card,
} from './blackjack.presenter';
import { bjpvpEmbed, type BjPvpPlayerView } from './blackjack-pvp.presenter';
import {
  BJT_CANCEL_ID,
  BJT_JOIN_ID,
  BJT_START_ID,
  bjtCancelledEmbed,
  bjtLobbyButtons,
  bjtLobbyEmbed,
  bjtNotEnoughEmbed,
} from './blackjack-table.presenter';

type OpenFail = { ok: false; reason: 'bad_bet' | 'cooldown' | 'busy' | 'no_coins'; min?: number; max?: number; resetMs?: number };
type OpenOk = {
  ok: true;
  sessionId: string;
  bet: number;
  maxPlayers: number;
  joinWindowMs: number;
  players: Array<{ discordId: string; displayName: string }>;
};
type JoinResult =
  | { ok: false; reason: 'no_session' | 'already_in' | 'full' | 'no_coins' }
  | { ok: true; full: boolean; players: Array<{ discordId: string; displayName: string }>; bet: number; hostId: string };
type DealResult =
  | { ok: false; reason: 'no_session' | 'only_host' | 'not_enough'; bet?: number }
  | {
      ok: true;
      bet: number;
      dealer: Card[];
      dealerTotal: number;
      players: Array<{ discordId: string; displayName: string; hand: Card[]; total: number }>;
    };
type HitResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      busted: boolean;
      hand: Card[];
      total: number;
      players: Array<{ discordId: string; displayName: string; hand: Card[]; total: number }>;
    };
type ResolveResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      kind: 'bjpvp';
      bet: number;
      isPush: boolean;
      results: Array<{
        discordId: string;
        displayName: string;
        hand: Card[];
        total: number;
        winner: boolean;
        payout: number;
        net: number;
        push: boolean;
      }>;
    };

export class BlackjackPvpCommands {
  constructor(private readonly api: InternalClient) {}

  get commands(): CommandExecutor[] {
    return [
      {
        name: 'bjpvp',
        execute: this.handleBjPvp,
      },
    ];
  }

  private handleBjPvp = async (ctx: CommandContext): Promise<void> => {
    const { invocation, args, user, t } = ctx;
    const { minBet, maxBet, roundTimeoutMs, tableMaxPlayers, tableJoinTimeoutMs } = economy.blackjack;
    const roundSeconds = Math.ceil(roundTimeoutMs / 1000);
    const bet = Number(args[0]);
    if (!Number.isInteger(bet) || bet < minBet || bet > maxBet) {
      await invocation.reply(t('blackjack.usage', { min: minBet, max: maxBet }));
      return;
    }

    const opened = await this.api.post<OpenOk | OpenFail>('/internal/v1/games/table/open', {
      kind: 'bjpvp',
      discordId: user.discordId,
      username: user.username ?? undefined,
      displayName: invocation.author.username,
      guildId: invocation.guildId,
      channelId: invocation.channelId,
      bet,
    });
    if (!opened.ok) {
      if (opened.reason === 'cooldown') await invocation.reply(t('error.cooldown', { seconds: Math.ceil((opened.resetMs ?? 0) / 1000) }));
      else if (opened.reason === 'busy') await invocation.reply(t('error.minigame_busy'));
      else if (opened.reason === 'no_coins') await invocation.reply(t('blackjack.no_coins'));
      else await invocation.reply(t('blackjack.usage', { min: opened.min ?? minBet, max: opened.max ?? maxBet }));
      return;
    }

    let playerCount = opened.players.length;
    const thumb = bjThumbnailFile();
    const lobbyMessage = await invocation.reply({
      files: thumb ? [thumb] : [],
      embeds: [
        bjtLobbyEmbed({
          hostId: user.discordId,
          playerIds: opened.players.map((p) => p.discordId),
          bet: opened.bet,
          maxPlayers: opened.maxPlayers,
          joinWindowSeconds: Math.ceil(opened.joinWindowMs / 1000),
          rules: t('blackjackPvp.rules'),
          t,
        }),
      ],
      components: [bjtLobbyButtons(t, false)],
    });

    const collector = lobbyMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: tableJoinTimeoutMs,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === BJT_START_ID) {
        if (interaction.user.id !== user.discordId) {
          await interaction.reply({ content: t('blackjackTable.only_host'), flags: MessageFlags.Ephemeral }).catch(() => undefined);
          return;
        }
        if (playerCount < 2) {
          await interaction.reply({ content: t('blackjackPvp.need_two'), flags: MessageFlags.Ephemeral }).catch(() => undefined);
          return;
        }
        await interaction.deferUpdate().catch(() => undefined);
        collector.stop('start');
        return;
      }
      if (interaction.customId === BJT_CANCEL_ID) {
        if (interaction.user.id !== user.discordId) {
          await interaction.reply({ content: t('blackjackTable.only_host'), flags: MessageFlags.Ephemeral }).catch(() => undefined);
          return;
        }
        await interaction.deferUpdate().catch(() => undefined);
        collector.stop('cancel');
        return;
      }
      if (interaction.customId !== BJT_JOIN_ID) return;
      const joined = await this.api.post<JoinResult>('/internal/v1/games/table/join', {
        sessionId: opened.sessionId,
        discordId: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.username,
      });
      if (!joined.ok) {
        const key =
          joined.reason === 'already_in'
            ? 'blackjackTable.already_in'
            : joined.reason === 'full'
              ? 'blackjackTable.full'
              : joined.reason === 'no_coins'
                ? 'blackjack.no_coins'
                : 'error.generic';
        await interaction.reply({ content: t(key), flags: MessageFlags.Ephemeral }).catch(() => undefined);
        return;
      }
      playerCount = joined.players.length;
      await interaction
        .update({
          embeds: [
            bjtLobbyEmbed({
              hostId: joined.hostId,
              playerIds: joined.players.map((p) => p.discordId),
              bet: joined.bet,
              maxPlayers: tableMaxPlayers,
              joinWindowSeconds: Math.ceil(tableJoinTimeoutMs / 1000),
              t,
            }),
          ],
          components: [bjtLobbyButtons(t, joined.full)],
        })
        .catch(() => undefined);
      if (joined.full) collector.stop('full');
    });

    const endReason = await new Promise<string>((resolve) => collector.on('end', (_c, reason) => resolve(reason)));
    if (endReason === 'cancel') {
      await this.api.post('/internal/v1/games/table/cancel', { sessionId: opened.sessionId, discordId: user.discordId });
      await lobbyMessage.edit({ content: null, embeds: [bjtCancelledEmbed({ command: 'bjpvp', t })], components: [] }).catch(() => undefined);
      return;
    }

    const dealt = await this.api.post<DealResult>('/internal/v1/games/table/deal', {
      sessionId: opened.sessionId,
      discordId: user.discordId,
    });
    if (!dealt.ok) {
      await lobbyMessage
        .edit({
          content: null,
          embeds: [bjtNotEnoughEmbed({ bet: dealt.bet ?? opened.bet, t })],
          components: [],
        })
        .catch(() => undefined);
      return;
    }

    const players = dealt.players.map((p) => ({ ...p }));
    const footers: string[] = players.map(() => t('blackjackTable.waiting'));
    const yourTurn = t('blackjack.your_turn', { seconds: roundSeconds });
    const turnContent = (idx: number): string =>
      idx >= 0 ? t('blackjackTable.your_turn_ping', { user: `<@${players[idx].discordId}>` }) : '';
    const renderEmbed = (activeIndex: number) =>
      bjpvpEmbed({
        title: t('blackjackPvp.title', { bet: dealt.bet }),
        color: BJ_COLORS.playerTurn,
        players: players.map((p, i) => ({
          displayName: p.displayName,
          hand: p.hand,
          total: p.total,
          footer: footers[i],
          active: i === activeIndex,
        })),
        t,
      });

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const hasNext = i + 1 < players.length;
      const nextActive = hasNext ? i + 1 : -1;
      if (p.total === 21) {
        footers[i] = t('blackjackTable.natural');
        if (hasNext) footers[i + 1] = yourTurn;
        await lobbyMessage
          .edit({ content: turnContent(nextActive), embeds: [renderEmbed(nextActive)], components: [bjButtons(t, !hasNext)] })
          .catch(() => undefined);
        continue;
      }
      if (footers[i] !== yourTurn) {
        footers[i] = yourTurn;
        await lobbyMessage
          .edit({ content: turnContent(i), embeds: [renderEmbed(i)], components: [bjButtons(t, false)] })
          .catch(() => undefined);
      }
      for (;;) {
        let interaction;
        try {
          interaction = await awaitAuthorButton(lobbyMessage, p.discordId, Date.now() + roundTimeoutMs, t);
        } catch {
          footers[i] = t('blackjack.timed_out');
          if (hasNext) footers[i + 1] = yourTurn;
          await lobbyMessage
            .edit({ content: turnContent(nextActive), embeds: [renderEmbed(nextActive)], components: [bjButtons(t, !hasNext)] })
            .catch(() => undefined);
          break;
        }
        if (interaction.customId === BJ_HIT_ID) {
          const hit = await this.api.post<HitResult>('/internal/v1/games/table/hit', {
            sessionId: opened.sessionId,
            discordId: p.discordId,
          });
          if (!hit.ok) {
            await interaction.update({ content: t('error.generic'), components: [] }).catch(() => undefined);
            return;
          }
          p.hand = hit.hand;
          p.total = hit.total;
          if (hit.busted) {
            footers[i] = t('blackjackTable.bust');
            if (hasNext) footers[i + 1] = yourTurn;
            await interaction
              .update({ content: turnContent(nextActive), embeds: [renderEmbed(nextActive)], components: [bjButtons(t, !hasNext)] })
              .catch(() => undefined);
            break;
          }
          await interaction
            .update({ content: turnContent(i), embeds: [renderEmbed(i)], components: [bjButtons(t, false)] })
            .catch(() => undefined);
          continue;
        }
        footers[i] = t('blackjack.stood', { total: p.total });
        if (hasNext) footers[i + 1] = yourTurn;
        await interaction
          .update({ content: turnContent(nextActive), embeds: [renderEmbed(nextActive)], components: [bjButtons(t, !hasNext)] })
          .catch(() => undefined);
        break;
      }
    }

    const resolved = await this.api.post<ResolveResult>('/internal/v1/games/table/resolve', {
      sessionId: opened.sessionId,
      discordId: user.discordId,
    });
    if (!resolved.ok || resolved.kind !== 'bjpvp') {
      await lobbyMessage.edit({ content: t('error.generic'), components: [] }).catch(() => undefined);
      return;
    }
    const results: BjPvpPlayerView[] = resolved.results.map((p) => ({
      displayName: p.displayName,
      hand: p.hand,
      total: p.total,
      footer: !p.winner
        ? t('blackjackPvp.lose')
        : p.push
          ? t('blackjackPvp.push')
          : resolved.results.filter((r) => r.winner).length > 1
            ? t('blackjackPvp.tie_win', { amount: p.payout, net: p.net })
            : t('blackjackPvp.win', { amount: p.payout, net: p.net }),
    }));
    await lobbyMessage
      .edit({
        content: '',
        embeds: [
          bjpvpEmbed({
            title: t('blackjackPvp.title', { bet: resolved.bet }),
            color: resolved.isPush ? BJ_COLORS.push : BJ_COLORS.win,
            players: results,
            t,
          }),
        ],
        components: [bjButtons(t, true)],
      })
      .catch(() => undefined);
  };
}
