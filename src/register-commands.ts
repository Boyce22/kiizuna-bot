import 'dotenv/config';

import { REST, Routes } from 'discord.js';

import { buildSlashCommandPayloads } from './slash-command-catalog';
import { captureError, childLogger, logger } from './observability/logger';

async function main(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;
  const configuredGuildIds = (process.env.DISCORD_COMMAND_GUILD_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!token) throw new Error('DISCORD_TOKEN ausente');
  if (!applicationId) throw new Error('DISCORD_APPLICATION_ID ausente');

  const body = buildSlashCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(token);
  const guildIds = configuredGuildIds.length > 0
    ? configuredGuildIds
    : ((await rest.get(Routes.userGuilds())) as Array<{ id: string }>).map((guild) => guild.id);
  if (guildIds.length === 0) throw new Error('O bot não está em nenhuma guild');

  for (const guildId of guildIds) {
    await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
    childLogger({ component: 'command-registration', guildId }).info(
      { commandCount: body.length },
      'guild commands synchronized',
    );
  }
  logger.info({ guildCount: guildIds.length, commandCount: body.length }, 'manual command sync completed');
}

main().catch((err) => {
  captureError(err, { phase: 'command-registration' });
  process.exit(1);
});
