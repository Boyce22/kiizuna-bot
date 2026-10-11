import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';

import type { InternalClient } from './client';
import { commandMetadata } from './command-metadata';
import { commandRegistry, initCommands } from './command-registry';
import { makeTranslator } from './i18n/i18n.service';
import {
  buildSlashCommandPayloads,
  parseSlashCommand,
  slashRoutes,
} from './slash-command-catalog';
import { parseCommand } from './utils/parser.util';

const expectedLegacyCommands = [
  'addchar',
  'animewishlist',
  'auction',
  'bind',
  'bjtable',
  'bjpvp',
  'blackjack',
  'boss',
  'charimage',
  'clearmessages',
  'coins',
  'collection',
  'daily',
  'duel',
  'editchar',
  'gallery',
  'gift',
  'globalhide',
  'globalprofile',
  'globaltop',
  'help',
  'higherlower',
  'language',
  'market',
  'market-admin',
  'profile',
  'ranks',
  'removechar',
  'reroll',
  'resetclaim',
  'resetrolls',
  'sell',
  'setup',
  'showcase',
  'site',
  'soulmate',
  'summon',
  'trade',
  'vip',
  'vip-admin',
  'wishlist',
].sort();

describe('slash command catalog', () => {
  it('covers every canonical prefix command', () => {
    initCommands({} as InternalClient);
    const canonical = [...new Set([...commandRegistry.values()].map((command) => command.name))].sort();
    const covered = [...new Set(slashRoutes.map((route) => route.legacyCommand))].sort();
    assert.deepEqual(canonical, expectedLegacyCommands);
    assert.deepEqual(covered, expectedLegacyCommands);
    assert.deepEqual([...commandMetadata.keys()].sort(), expectedLegacyCommands);
  });

  it('keeps canonical names and prefix aliases unique in the central catalog', () => {
    const names = new Map<string, string>();
    for (const command of commandMetadata.values()) {
      for (const name of [command.name, ...(command.aliases ?? [])]) {
        assert.equal(names.has(name), false, `${name} is shared by ${names.get(name)} and ${command.name}`);
        names.set(name, command.name);
      }
    }
  });

  it('declares setup availability and Discord permissions explicitly', () => {
    assert.equal(commandMetadata.get('setup')?.availableBeforeSetup, true);
    assert.equal(commandMetadata.get('setup')?.bypassChannelRestriction, true);
    assert.equal(commandMetadata.get('help')?.availableBeforeSetup, true);
    assert.equal(commandMetadata.get('language')?.availableBeforeSetup, true);
    assert.equal(commandMetadata.get('summon')?.availableBeforeSetup, undefined);

    const payloads = buildSlashCommandPayloads();
    assert.equal(
      payloads.find((payload) => payload.name === 'setup')?.default_member_permissions,
      PermissionFlagsBits.ManageGuild.toString(),
    );
    assert.equal(payloads.find((payload) => payload.name === 'admin')?.default_member_permissions, undefined);
  });

  it('has unique routes and valid direct descriptions without em dashes', () => {
    const paths = slashRoutes.map((route) => [route.root, route.group, route.subcommand].filter(Boolean).join(' '));
    assert.equal(new Set(paths).size, paths.length);

    const payloads = buildSlashCommandPayloads();
    assert.equal(payloads.length, 12);
    const descriptions: string[] = [];
    const localizedDescriptions: string[] = [];
    const visit = (node: {
      name?: string;
      description?: string;
      description_localizations?: Record<string, string | null> | null;
      options?: readonly unknown[];
    }): void => {
      if (node.name) assert.match(node.name, /^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u);
      if (node.description) descriptions.push(node.description);
      if (node.description_localizations) {
        assert.deepEqual(Object.keys(node.description_localizations).sort(), ['en-US', 'es-ES', 'ja']);
        localizedDescriptions.push(...Object.values(node.description_localizations).filter((value): value is string => value !== null));
      }
      assert.ok((node.options?.length ?? 0) <= 25, node.name);
      for (const child of node.options ?? []) visit(child as Parameters<typeof visit>[0]);
    };
    for (const payload of payloads) visit(payload);
    assert.ok(descriptions.length > slashRoutes.length);
    assert.equal(localizedDescriptions.length, descriptions.length * 3);
    for (const description of [...descriptions, ...localizedDescriptions]) {
      assert.ok(description.length >= 1 && description.length <= 100, description);
      assert.ok(!description.includes('—'), description);
      assert.ok(!description.startsWith('command.'), description);
    }
  });

  it('keeps required options before optional options', () => {
    for (const route of slashRoutes) {
      let optionalFound = false;
      for (const option of route.options ?? []) {
        if (!option.required) optionalFound = true;
        if (option.required) assert.equal(optionalFound, false, `${route.root}/${route.subcommand}: ${option.name}`);
      }
    }
  });

  it('maps typed slash options to the legacy executor input', () => {
    const values = new Map<string, unknown>([
      ['tipo', 'waifu'],
      ['nsfw', true],
      ['anime', 'Naruto'],
    ]);
    const interaction = {
      commandName: 'gacha',
      options: {
        getSubcommandGroup: () => null,
        getSubcommand: () => 'summon',
        getString: (name: string) => values.get(name) ?? null,
        getInteger: (name: string) => values.get(name) ?? null,
        getBoolean: (name: string) => values.get(name) ?? null,
        getUser: () => null,
        getChannel: () => null,
      },
    } as unknown as ChatInputCommandInteraction<'cached'>;

    assert.deepEqual(parseSlashCommand(interaction)?.parsed, {
      name: 'summon',
      args: ['waifu'],
      flags: { nsfw: true, target: 'Naruto' },
    });
  });

  it('makes setup prefix explicitly target the legacy parser', () => {
    const route = slashRoutes.find((item) => item.root === 'setup' && item.subcommand === 'prefix');
    assert.ok(route);
    assert.match(route.description, /somente o prefixo dos comandos legados/i);
  });

  it('keeps legacy help descriptions concise and free of em dashes', () => {
    initCommands({} as InternalClient);
    for (const locale of ['en', 'pt', 'es', 'ja'] as const) {
      const t = makeTranslator(locale, { prefix: '?' });
      for (const command of new Set(commandRegistry.values())) {
        if (!command.descriptionKey) continue;
        const description = t(command.descriptionKey);
        assert.ok(description.length >= 1 && description.length <= 100, `${locale}: ${command.name}`);
        assert.ok(!description.includes('—'), `${locale}: ${command.name}: ${description}`);
      }
    }
  });

  it('renders legacy usage text with the configured prefix', () => {
    const t = makeTranslator('pt', { prefix: '?' });
    assert.match(t('summon.usage'), /^\?/);
    assert.ok(!t('summon.usage').includes('{prefix}'));
  });

  it('keeps configured prefix parsing and slash parsing independent', () => {
    assert.deepEqual(parseCommand('?summon waifu --nsfw --target Naruto Shippuden', '?'), {
      name: 'summon',
      args: ['waifu'],
      flags: { nsfw: true, target: 'Naruto Shippuden' },
    });
    assert.equal(parseCommand('/gacha summon', '?'), null);
  });

  it('generates a deterministic registration payload', () => {
    assert.deepEqual(buildSlashCommandPayloads(), buildSlashCommandPayloads());
  });
});
