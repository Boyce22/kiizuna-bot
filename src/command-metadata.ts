import type { Command } from './interfaces';

export type CommandMetadata = Omit<Command, 'execute'>;

const metadata = [
  { name: 'packs', aliases: ['s', 'summon', 'pacotes', 'vitrine-packs'], descriptionKey: 'command.packs.description' },
  { name: 'open', aliases: ['abrir', 'o'], descriptionKey: 'command.open.description' },
  { name: 'collection', aliases: ['col', 'harem'], descriptionKey: 'command.collection.description' },
  { name: 'coins', aliases: ['c', 'balance'], descriptionKey: 'command.coins.description' },
  { name: 'daily', aliases: ['tribute'], descriptionKey: 'command.tribute.description' },
  { name: 'wishlist', aliases: ['wl', 'desejos'], descriptionKey: 'command.wishlist.description' },
  { name: 'animewishlist', aliases: ['aw', 'desejoanime'], descriptionKey: 'command.animewishlist.description' },
  { name: 'profile', aliases: ['p', 'perfil'], descriptionKey: 'command.profile.description' },
  { name: 'gift', aliases: ['presente', 'bond', 'up'], descriptionKey: 'command.gift.description' },
  { name: 'soulmate', aliases: ['almagemea'], descriptionKey: 'command.soulmate.description' },
  { name: 'gallery', aliases: ['galeria'], descriptionKey: 'command.gallery.description' },
  { name: 'market', aliases: ['mercado'], descriptionKey: 'command.market.description' },
  { name: 'auction', aliases: ['leilao', 'leilão'], descriptionKey: 'command.auction.description' },
  { name: 'sell', aliases: ['vender'], descriptionKey: 'command.sell.description' },
  { name: 'trade', aliases: ['troca'], descriptionKey: 'command.trade.description' },
  { name: 'market-admin', aliases: ['marketadmin', 'mercado-admin'], descriptionKey: 'command.marketAdmin.description' },
  { name: 'boss', aliases: ['luta', 'battle'], descriptionKey: 'command.boss.description' },
  { name: 'globalprofile', aliases: ['gp', 'gprofile'], descriptionKey: 'command.globalprofile.description' },
  { name: 'globaltop', aliases: ['gtop'], descriptionKey: 'command.globaltop.description' },
  { name: 'globalhide', aliases: ['ghide'], descriptionKey: 'command.globalhide.description' },
  { name: 'ranks', aliases: ['rank'], descriptionKey: 'command.ranks.description' },
  { name: 'showcase', aliases: ['vitrine'], descriptionKey: 'command.showcase.description' },
  { name: 'vip', descriptionKey: 'command.vip.description' },
  { name: 'vip-admin', aliases: ['vipadmin'], descriptionKey: 'command.vipAdmin.description' },
  { name: 'site', aliases: ['web', 'conta'], descriptionKey: 'command.site.description' },
  { name: 'language', aliases: ['lang', 'idioma'], descriptionKey: 'command.language.description', availableBeforeSetup: true },
  { name: 'setup', aliases: ['config'], descriptionKey: 'command.setup.description', bypassChannelRestriction: true, availableBeforeSetup: true },
  { name: 'charimage', aliases: ['cimg'], descriptionKey: 'command.charimage.description' },
  { name: 'addchar', aliases: ['novacarta'], descriptionKey: 'command.addchar.description' },
  { name: 'editchar', aliases: ['editarcarta'], descriptionKey: 'command.editchar.description' },
  { name: 'removechar', aliases: ['rmchar', 'delchar'], descriptionKey: 'command.removechar.description' },
  { name: 'resetrolls', aliases: ['rrolls', 'resetarrolls'], descriptionKey: 'command.resetrolls.description' },
  { name: 'resetclaim', aliases: ['rclaim', 'resetarclaim'], descriptionKey: 'command.resetclaim.description' },
  { name: 'clearmessages', aliases: ['clearmsgs', 'limparmsg'], descriptionKey: 'command.clearmessages.description' },
  { name: 'help', aliases: ['h', 'ajuda', 'comandos'], descriptionKey: 'command.help.description', availableBeforeSetup: true },
] satisfies CommandMetadata[];

export const commandMetadata = new Map(metadata.map((command) => [command.name, command]));

export function getCommandMetadata(name: string): CommandMetadata {
  const command = commandMetadata.get(name);
  if (!command) throw new Error(`Metadados ausentes para o comando ${name}`);
  return command;
}
