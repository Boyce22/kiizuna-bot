// Posta um anúncio (markdown do Discord) num canal, como o bot.
// Uso: npm run announce -- <channelId> <arquivo.md> [--publish] [--dry]
//   --publish  publica nos servidores que seguem o canal (só canal de anúncios)
//   --dry      só valida e mostra o texto, sem postar
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REST, Routes } from 'discord.js';

const MAX_LENGTH = 2000;

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const [channelId, file] = args.filter((arg) => !arg.startsWith('--'));
if (!channelId || !file) throw new Error('Uso: npm run announce -- <channelId> <arquivo.md> [--publish] [--dry]');

const content = readFileSync(resolve(file), 'utf8').trim();
if (content.length > MAX_LENGTH) throw new Error(`Mensagem com ${content.length} caracteres (máximo ${MAX_LENGTH})`);

if (flags.has('--dry')) {
  console.log(content);
  console.log(`\n${content.length}/${MAX_LENGTH} caracteres — nada foi postado`);
  process.exit(0);
}

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN ausente');
const rest = new REST({ version: '10' }).setToken(token);

const message = await rest.post(Routes.channelMessages(channelId), {
  body: { content, allowed_mentions: { parse: ['everyone', 'roles'] } },
});
console.log(`Postado no canal ${channelId} (mensagem ${message.id})`);

if (flags.has('--publish')) {
  await rest.post(Routes.channelMessageCrosspost(channelId, message.id));
  console.log('Publicado para os servidores que seguem o canal');
}
