import 'dotenv/config';

import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

import type { Locale } from './interfaces';
import { internalClient } from './client';
import { initCommands } from './command-registry';
import { registerEvents } from './events';
import { translate } from './i18n/i18n.service';
import { registerCommandsForCurrentGuilds, registerGuildCommands } from './guild-command-registration';
import { captureError, childLogger, logger } from './observability/logger';
import { installTelemetry } from './observability/telemetry';

async function drainNotify(bot: Client): Promise<void> {
  const { items } = await internalClient.post<{
    items: Array<{
      type: string;
      discordId: string;
      key: string;
      locale?: Locale;
      vars?: Record<string, string>;
    }>;
  }>('/internal/v1/notify/drain');
  let delivered = 0;
  let failed = 0;
  for (const item of items) {
    if (item.type !== 'dm') continue;
    const user = await bot.users.fetch(item.discordId).catch(() => null);
    if (!user) {
      failed++;
      continue;
    }
    const sent = await user.send(translate(item.key, item.locale ?? 'en', item.vars)).then(() => true, () => false);
    if (sent) delivered++;
    else failed++;
  }
  if (items.length > 0) logger.info({ queued: items.length, delivered, failed }, 'notification drain completed');
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN ausente');
  const stopTelemetry = installTelemetry(logger);

  initCommands(internalClient);

  const bot = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  registerEvents(bot, internalClient);
  bot.on(Events.Error, (err) => captureError(err, { component: 'discord-client' }));
  bot.on(Events.Warn, (message) => logger.warn({ component: 'discord-client', message }, 'discord warning'));
  bot.on(Events.ShardError, (err, shardId) => captureError(err, { component: 'discord-shard', shardId }));
  bot.on(Events.ShardDisconnect, (event, shardId) =>
    logger.warn({ component: 'discord-shard', shardId, code: event.code }, 'discord shard disconnected'),
  );
  bot.on(Events.ShardReconnecting, (shardId) =>
    logger.info({ component: 'discord-shard', shardId }, 'discord shard reconnecting'),
  );
  bot.on(Events.ShardResume, (shardId, replayedEvents) =>
    logger.info({ component: 'discord-shard', shardId, replayedEvents }, 'discord shard resumed'),
  );

  let notifyTimer: NodeJS.Timeout | undefined;
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown');
    if (notifyTimer) clearInterval(notifyTimer);
    stopTelemetry();
    bot.destroy();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  bot.once(Events.ClientReady, (c) => {
    logger.info(
      { botUserId: c.user.id, guildCount: c.guilds.cache.size, websocketPingMs: c.ws.ping },
      'discord client ready',
    );
    void registerCommandsForCurrentGuilds(c.guilds.cache.values())
      .then((guilds) => {
        for (const guild of guilds) {
          childLogger({ component: 'command-registration', guildId: guild.guildId }).info(
            { commandCount: guild.count },
            'guild commands synchronized',
          );
        }
      })
      .catch((err) => captureError(err, { component: 'command-registration', phase: 'ready' }));
    notifyTimer = setInterval(
      () => void drainNotify(bot).catch((err) => captureError(err, { component: 'notifications' })),
      5_000,
    );
    notifyTimer.unref();
  });
  bot.on(Events.GuildCreate, (guild) => {
    void registerGuildCommands(guild)
      .then((count) =>
        childLogger({ component: 'command-registration', guildId: guild.id }).info(
          { commandCount: count },
          'guild commands synchronized',
        ),
      )
      .catch((err) => captureError(err, { component: 'command-registration', guildId: guild.id }));
  });

  try {
    await bot.login(token);
  } catch (err) {
    stopTelemetry();
    throw err;
  }
}

main().catch((err) => {
  captureError(err, { phase: 'bootstrap' });
  process.exit(1);
});

process.on('unhandledRejection', (err) => captureError(err, { phase: 'unhandled-rejection' }));
