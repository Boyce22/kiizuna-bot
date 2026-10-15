import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { InternalApiError, InternalClient } from './client';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Responde toda requisição com o status e o corpo dados (corpo `null` = sem corpo, como o 204). */
function respond(status: number, body: unknown): void {
  globalThis.fetch = (async () =>
    new Response(body === null ? null : JSON.stringify(body), { status })) as typeof fetch;
}

const client = new InternalClient('http://api.test', 'secret');

describe('InternalClient.call', () => {
  it('sucesso devolve o corpo com ok: true', async () => {
    respond(200, { price: 300 });
    assert.deepEqual(await client.call('/internal/v1/x'), { ok: true, price: 300 });
  });

  it('204 sem corpo é sucesso vazio', async () => {
    respond(204, null);
    assert.deepEqual(await client.call('/internal/v1/x'), { ok: true });
  });

  it('recusa 4xx volta como resultado, com o código e os detalhes', async () => {
    respond(409, { code: 'BELOW_FLOOR', floor: 1000 });
    assert.deepEqual(await client.call('/internal/v1/x'), {
      ok: false,
      status: 409,
      code: 'BELOW_FLOOR',
      floor: 1000,
    });
  });

  it('falha 5xx continua lançando', async () => {
    respond(500, { code: 'INTERNAL' });
    await assert.rejects(client.call('/internal/v1/x'), (err: unknown) => {
      assert.ok(err instanceof InternalApiError);
      assert.equal(err.status, 500);
      return true;
    });
  });

  it('post lança a recusa com código e detalhes', async () => {
    respond(429, { code: 'COOLDOWN', resetMs: 1200 });
    await assert.rejects(client.post('/internal/v1/x'), (err: unknown) => {
      assert.ok(err instanceof InternalApiError);
      assert.equal(err.code, 'COOLDOWN');
      assert.deepEqual(err.details, { resetMs: 1200 });
      return true;
    });
  });
});

/** Registra cada chamada (caminho e cabeçalhos) e responde 200 com `body`. */
function recordCalls(body: unknown = {}): Array<{ url: string; headers: Record<string, string> }> {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe('InternalClient: assinatura', () => {
  it('cada requisição leva um nonce novo', async () => {
    const calls = recordCalls();
    await client.post('/internal/v1/x', { a: 1 });
    await client.post('/internal/v1/x', { a: 1 });
    const [first, second] = calls.map((c) => c.headers['X-Kizuna-Nonce']);
    assert.match(first, /^[a-f0-9]{32}$/);
    assert.notEqual(first, second);
    assert.notEqual(calls[0].headers['X-Kizuna-Signature'], calls[1].headers['X-Kizuna-Signature']);
  });
});

describe('InternalClient: config da guild em cache', () => {
  const ensure = '/internal/v1/guilds/ensure';

  it('mensagens da mesma guild não repetem o ensure', async () => {
    const api = new InternalClient('http://api.test', 'secret');
    const calls = recordCalls({ prefix: 'k!' });
    await Promise.all([api.post(ensure, { guildId: 'g1' }), api.post(ensure, { guildId: 'g1' })]);
    await api.post(ensure, { guildId: 'g1' });
    await api.post(ensure, { guildId: 'g2' });
    assert.equal(calls.length, 2);
  });

  it('setup da guild invalida o cache dela', async () => {
    const api = new InternalClient('http://api.test', 'secret');
    const calls = recordCalls({ prefix: 'k!' });
    await api.post(ensure, { guildId: 'g1' });
    await api.post('/internal/v1/guilds/setup', { guildId: 'g1', action: 'prefix', value: '!' });
    await api.post(ensure, { guildId: 'g1' });
    assert.deepEqual(
      calls.map((c) => c.url.replace('http://api.test', '')),
      [ensure, '/internal/v1/guilds/setup', ensure],
    );
  });

  it('falha não fica em cache', async () => {
    const api = new InternalClient('http://api.test', 'secret');
    respond(500, { code: 'INTERNAL' });
    await assert.rejects(api.post(ensure, { guildId: 'g1' }));
    const calls = recordCalls({ prefix: 'k!' });
    await api.post(ensure, { guildId: 'g1' });
    assert.equal(calls.length, 1);
  });
});
