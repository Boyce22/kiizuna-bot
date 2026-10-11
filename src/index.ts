import 'dotenv/config';

import { Client, Events, GatewayIntentBits, Partials } from 'discord.js';

import { internalClient } from './client';
import { initCommands } from './command-registry';
import { registerEvents } from './events';

async function drainNotify(bot: Client): Promise<void> {
  const { items } = await internalClient.post<{
    items: Array<{ type: string; discordId: string; key: string; vars?: Record<string, string> }>;
  }>('/internal/v1/notify/drain');
  for (const item of items) {
    if (item.type !== 'dm') continue;
    const user = await bot.users.fetch(item.discordId).catch(() => null);
    if (user) await user.send(item.key).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN ausente');

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
  bot.once(Events.ClientReady, (c) => {
    console.log(`kizuna-bot online as ${c.user.tag}`);
    setInterval(() => void drainNotify(bot).catch(() => undefined), 5_000);
  });

  await bot.login(token);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
