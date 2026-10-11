import { performance } from 'node:perf_hooks';

import { type InternalClient, InternalApiError } from './client';
import type { CommandInvocation } from './command-invocation';
import { commandRegistry } from './command-registry';
import { buildContext } from './context';
import { makeTranslator, resolveLocale } from './i18n/i18n.service';
import type { GuildConfigView } from './interfaces';
import {
  contextualLogger,
  currentLogContext,
  runWithLogContext,
  updateLogContext,
} from './observability/context';
import { newCorrelationId } from './observability/logger';
import { recordCommand } from './observability/telemetry';
import type { ParsedCommand } from './utils/parser.util';

const FALLBACK_ERROR_EMOJI = '❌';
const BANNED_MESSAGE = '🚫 Você está banido e não pode usar o bot.';

export async function dispatchCommand(
  api: InternalClient,
  invocation: CommandInvocation,
  parsed: ParsedCommand,
  knownConfig?: GuildConfigView,
): Promise<void> {
  if (!currentLogContext()) {
    return runWithLogContext(
      {
        requestId: newCorrelationId(),
        source: invocation.source,
        event: 'command',
        invokedCommand: parsed.name,
        guildId: invocation.guildId,
        channelId: invocation.channelId,
        discordUserId: invocation.author.id,
      },
      () => dispatchWithinContext(api, invocation, parsed, knownConfig),
    );
  }
  return dispatchWithinContext(api, invocation, parsed, knownConfig);
}

async function dispatchWithinContext(
  api: InternalClient,
  invocation: CommandInvocation,
  parsed: ParsedCommand,
  knownConfig?: GuildConfigView,
): Promise<void> {
  const startedAt = performance.now();
  const command = commandRegistry.get(parsed.name);
  if (!command) {
    const elapsedMs = performance.now() - startedAt;
    contextualLogger().info({ outcome: 'unknown_command', elapsedMs }, 'command ignored');
    recordCommand(invocation.source, parsed.name, 'unknown_command', elapsedMs);
    return;
  }
  updateLogContext({ command: command.name, invokedCommand: parsed.name });
  const log = contextualLogger();
  const finish = (outcome: string): void => {
    const elapsedMs = performance.now() - startedAt;
    recordCommand(invocation.source, command.name, outcome, elapsedMs);
    log.info({ outcome, elapsedMs }, 'command completed');
  };

  let config: GuildConfigView;
  try {
    config =
      knownConfig ??
      (await api.post<GuildConfigView>('/internal/v1/guilds/ensure', { guildId: invocation.guildId }));
  } catch (err) {
    const elapsedMs = performance.now() - startedAt;
    recordCommand(invocation.source, command.name, 'error', elapsedMs);
    log.error({ err, phase: 'guild-config', elapsedMs }, 'command failed');
    await invocation.reply(FALLBACK_ERROR_EMOJI, true).catch(() => undefined);
    return;
  }
  const guildTranslator = makeTranslator(resolveLocale(null, config.defaultLocale), {
    prefix: config.prefix,
  });

  if (
    !command.bypassChannelRestriction &&
    config.allowedChannelIds.length > 0 &&
    !config.allowedChannelIds.includes(invocation.channelId)
  ) {
    const channels = config.allowedChannelIds.map((id) => `<#${id}>`).join(', ');
    const reply = await invocation
      .reply(guildTranslator('error.wrong_channel', { channels }), true)
      .catch(() => null);
    await invocation.deleteSource();
    if (reply && invocation.source === 'message') {
      setTimeout(() => reply.delete().catch(() => undefined), 5_000);
    }
    finish('wrong_channel');
    return;
  }

  if (!config.scopeMode && !command.availableBeforeSetup) {
    await invocation
      .reply(guildTranslator('error.guild_not_configured', { prefix: config.prefix }), true)
      .catch(() => undefined);
    finish('setup_required');
    return;
  }

  try {
    const ctx = await buildContext(api, invocation, parsed);
    if (ctx.user.isBanned) {
      await invocation.reply(BANNED_MESSAGE, true);
      finish('banned');
      return;
    }
    await command.execute(ctx);
    finish('success');
  } catch (err) {
    if (isGuildNotConfigured(err)) {
      await invocation
        .reply(guildTranslator('error.guild_not_configured', { prefix: config.prefix }), true)
        .catch(() => undefined);
      finish('setup_required');
      return;
    }
    const elapsedMs = performance.now() - startedAt;
    recordCommand(invocation.source, command.name, 'error', elapsedMs);
    log.error({ err, phase: 'execute', elapsedMs }, 'command failed');
    await invocation.reply(FALLBACK_ERROR_EMOJI, true).catch(() => undefined);
  }
}

function isGuildNotConfigured(err: unknown): boolean {
  return err instanceof InternalApiError && err.code === 'guild_not_configured';
}
