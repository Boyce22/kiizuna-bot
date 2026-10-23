import type { InternalClient } from './client';
import { getCommandMetadata } from './command-metadata';
import { AdminCommands } from './commands/admin.commands';
import { AnimeWishlistCommands } from './commands/anime-wishlist.commands';
import { AuctionCommands } from './commands/auction.commands';
import { BondCommands } from './commands/bond.commands';
import { BossCommands } from './commands/boss.commands';
import { CollectionCommands } from './commands/collection.commands';
import { EconomyCommands } from './commands/economy.commands';
import { GalleryCommands } from './commands/gallery.commands';
import { GlobalCommands } from './commands/global.commands';
import { HelpCommands } from './commands/help.commands';
import { MarketAdminCommands } from './commands/market-admin.commands';
import { MarketCommands } from './commands/market.commands';
import { PacksCommands } from './commands/packs.commands';
import { ProfileCommands } from './commands/profile.commands';
import { SellCommands } from './commands/sell.commands';
import { SettingsCommands } from './commands/settings.commands';
import { SiteCommands } from './commands/site.commands';
import { TradeCommands } from './commands/trade.commands';
import { VipCommands } from './commands/vip.commands';
import { WishlistCommands } from './commands/wishlist.commands';
import type { Command, CommandExecutor } from './interfaces';

export interface CommandGroup {
  key: string;
  commands: Command[];
}

export const commandGroups: CommandGroup[] = [];
export const commandRegistry = new Map<string, Command>();

function withMetadata(executors: CommandExecutor[]): Command[] {
  return executors.map((executor) => ({ ...getCommandMetadata(executor.name), execute: executor.execute }));
}

export function initCommands(api: InternalClient): void {
  commandGroups.length = 0;
  commandGroups.push(
    { key: 'gacha', commands: withMetadata(new PacksCommands(api).commands) },
    { key: 'collection', commands: withMetadata(new CollectionCommands(api).commands) },
    { key: 'economy', commands: withMetadata(new EconomyCommands(api).commands) },
    {
      key: 'wishlist',
      commands: withMetadata([...new WishlistCommands(api).commands, ...new AnimeWishlistCommands(api).commands]),
    },
    {
      key: 'social',
      commands: withMetadata([
        ...new ProfileCommands(api).commands,
        ...new BondCommands(api).commands,
        ...new GalleryCommands(api).commands,
      ]),
    },
    {
      key: 'market',
      commands: withMetadata([
        ...new MarketCommands(api).commands,
        ...new AuctionCommands(api).commands,
        ...new SellCommands(api).commands,
        ...new TradeCommands(api).commands,
        ...new MarketAdminCommands(api).commands,
      ]),
    },
    {
      key: 'games',
      commands: withMetadata([
        ...new BossCommands(api).commands,
      ]),
    },
    { key: 'global', commands: withMetadata(new GlobalCommands(api).commands) },
    { key: 'vip', commands: withMetadata(new VipCommands(api).commands) },
    {
      key: 'settings',
      commands: withMetadata([...new SettingsCommands(api).commands, ...new SiteCommands(api).commands]),
    },
    { key: 'admin', commands: withMetadata(new AdminCommands(api).commands) },
    { key: 'core', commands: withMetadata(new HelpCommands().commands) },
  );
  commandRegistry.clear();
  for (const command of commandGroups.flatMap((g) => g.commands)) {
    commandRegistry.set(command.name, command);
    for (const alias of command.aliases ?? []) commandRegistry.set(alias, command);
  }
}
