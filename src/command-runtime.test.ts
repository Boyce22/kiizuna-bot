import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ChatInputCommandInteraction, Message } from 'discord.js';

import type { InternalClient } from './client';
import { InternalClient as RealInternalClient } from './client';
import { dispatchCommand } from './command-dispatcher';
import { SlashCommandInvocation, type CommandInvocation } from './command-invocation';
import { initCommands } from './command-registry';
import { registerCommandsForCurrentGuilds, registerGuildCommands } from './guild-command-registration';
import { runWithLogContext } from './observability/context';
import type { BotUser, GuildConfigView } from './interfaces';

const config: GuildConfigView = {
  guildId: 'guild',
  scopeMode: 'guild',
  prefix: '?',
  defaultLocale: 'pt',
  rollIntervalMinutes: 60,
  allowedChannelIds: [],
  allowedTypes: ['all'],
  rollChannelId: null,
};

const user: BotUser = {
  id: 'internal-user',
  discordId: 'user',
  username: 'tester',
  coins: 100,
  locale: 'pt',
  isBanned: false,
  globalRank: 1,
};

function fakeApi(overrides: Partial<BotUser> = {}): InternalClient {
  return {
    post: async (path: string) => {
      if (path === '/internal/v1/guilds/ensure') return config;
      if (path === '/internal/v1/users/ensure') return { ...user, ...overrides };
      throw new Error(`unexpected API call: ${path}`);
    },
  } as InternalClient;
}

function fakeInvocation(source: 'message' | 'slash' = 'slash') {
  const replies: Array<{ payload: unknown; ephemeral: boolean | undefined }> = [];
  let deleted = false;
  const invocation = {
    source,
    author: { id: 'user', username: 'tester' },
    member: null,
    guild: null,
    guildId: 'guild',
    channelId: 'channel',
    channel: {},
    client: {},
    mentions: {
      users: { first: () => undefined },
      members: { first: () => undefined },
      channels: { first: () => undefined },
    },
    deferred: false,
    defer: async () => undefined,
    reply: async (payload: unknown, ephemeral?: boolean) => {
      replies.push({ payload, ephemeral });
      return { delete: async () => undefined } as unknown as Message;
    },
    deleteSource: async () => {
      deleted = true;
    },
  } as unknown as CommandInvocation;
  return { invocation, replies, wasDeleted: () => deleted };
}

describe('shared command runtime', () => {
  it('executes a prefix or slash command through the same dispatcher', async () => {
    initCommands(fakeApi());
    const target = fakeInvocation();
    await dispatchCommand(fakeApi(), target.invocation, { name: 'help', args: [], flags: {} }, config);
    assert.equal(target.replies.length, 1);
    assert.ok('embeds' in (target.replies[0].payload as object));
  });

  it('applies channel policy before loading the user', async () => {
    initCommands(fakeApi());
    const target = fakeInvocation();
    const restricted = { ...config, allowedChannelIds: ['another-channel'] };
    await dispatchCommand(fakeApi(), target.invocation, { name: 'summon', args: [], flags: {} }, restricted);
    assert.equal(target.replies.length, 1);
    assert.equal(target.replies[0].ephemeral, true);
    assert.equal(target.wasDeleted(), true);
  });

  it('blocks banned users for both transports', async () => {
    const api = fakeApi({ isBanned: true });
    initCommands(api);
    const target = fakeInvocation('message');
    await dispatchCommand(api, target.invocation, { name: 'help', args: [], flags: {} }, config);
    assert.equal(target.replies.length, 1);
    assert.match(String(target.replies[0].payload), /banido/i);
  });
});

describe('internal API configuration', () => {
  it('treats blank URL and secret variables as development defaults', async () => {
    const originalUrl = process.env.INTERNAL_API_URL;
    const originalSecret = process.env.INTERNAL_API_SECRET;
    process.env.INTERNAL_API_URL = '   ';
    process.env.INTERNAL_API_SECRET = '';
    try {
      const client = new RealInternalClient() as unknown as { baseUrl: string; secret: string };
      assert.equal(client.baseUrl, 'http://127.0.0.1:3001');
      assert.equal(client.secret, 'dev-internal-api-secret-change-me');
    } finally {
      if (originalUrl === undefined) delete process.env.INTERNAL_API_URL;
      else process.env.INTERNAL_API_URL = originalUrl;
      if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
      else process.env.INTERNAL_API_SECRET = originalSecret;
    }
  });

  it('propagates the invocation request ID to the API', async () => {
    const originalFetch = global.fetch;
    let receivedRequestId: string | null = null;
    global.fetch = async (_input, init) => {
      receivedRequestId = new Headers(init?.headers).get('X-Request-ID');
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
      const client = new RealInternalClient('http://api.local', 'development-secret');
      await runWithLogContext(
        { requestId: 'correlation-123', source: 'message', event: 'test' },
        () => client.post('/internal/v1/test'),
      );
      assert.equal(receivedRequestId, 'correlation-123');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('slash invocation adapter', () => {
  it('edits the deferred response once and uses follow-ups afterwards', async () => {
    const calls: string[] = [];
    const message = {} as Message;
    const interaction = {
      options: { data: [] },
      deferred: false,
      replied: false,
      deferReply: async () => {
        interaction.deferred = true;
        calls.push('defer');
      },
      editReply: async () => {
        calls.push('edit');
        return message;
      },
      followUp: async () => {
        calls.push('followUp');
        return message;
      },
    } as unknown as ChatInputCommandInteraction<'cached'>;
    const invocation = new SlashCommandInvocation(interaction);
    await invocation.defer();
    await invocation.reply('primeira');
    await invocation.reply('segunda');
    assert.deepEqual(calls, ['defer', 'edit', 'followUp']);
  });

  it('exposes users and channels resolved from typed options', () => {
    const targetUser = { id: 'target' };
    const targetChannel = { id: 'target-channel' };
    const interaction = {
      options: {
        data: [
          {
            name: 'group',
            type: 2,
            options: [
              { name: 'usuario', type: 6, user: targetUser },
              { name: 'canal', type: 7, channel: targetChannel },
            ],
          },
        ],
      },
    } as unknown as ChatInputCommandInteraction<'cached'>;
    const invocation = new SlashCommandInvocation(interaction);
    assert.equal(invocation.mentions.users.first()?.id, 'target');
    assert.equal(invocation.mentions.channels.first()?.id, 'target-channel');
  });
});

describe('guild command registration', () => {
  it('registers the complete catalog in a guild', async () => {
    let received: unknown[] = [];
    const guild = {
      id: 'guild-1',
      commands: { set: async (commands: unknown[]) => { received = commands; } },
    };
    const count = await registerGuildCommands(guild as never);
    assert.equal(count, 12);
    assert.equal(received.length, 12);
  });

  it('registers every guild already connected to the bot', async () => {
    const calls: string[] = [];
    const guilds = ['guild-1', 'guild-2'].map((id) => ({
      id,
      commands: { set: async () => { calls.push(id); } },
    }));
    const result = await registerCommandsForCurrentGuilds(guilds as never);
    assert.deepEqual(calls, ['guild-1', 'guild-2']);
    assert.deepEqual(result, [
      { guildId: 'guild-1', count: 12 },
      { guildId: 'guild-2', count: 12 },
    ]);
  });
});
