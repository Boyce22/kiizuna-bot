import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { InternalApiError, InternalClient } from './client';
import { signInternalContext } from './hmac';
import { runWithLogContext } from './observability/context';

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

  it('dentro de um comando, o contexto do Discord vai assinado e preso ao nonce', async () => {
    const calls = recordCalls();
    const discord = { eventId: '1234', trigger: 'interaction' as const, locale: 'pt-BR' };
    await runWithLogContext({ requestId: 'r1', source: 'slash', discord }, () =>
      client.post('/internal/v1/x', { a: 1 }),
    );
    const { headers } = calls[0];
    const encoded = headers['X-Kizuna-Context'];
    assert.deepEqual(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')), discord);
    const expected = signInternalContext('secret', headers['X-Kizuna-Nonce'], encoded);
    assert.equal(headers['X-Kizuna-Context-Signature'], expected);
  });

  it('fora de comando (job do bot), sem cabeçalho de contexto', async () => {
    const calls = recordCalls();
    await client.post('/internal/v1/x', { a: 1 });
    assert.equal(calls[0].headers['X-Kizuna-Context'], undefined);
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

describe('InternalClient: API sobrecarregada', () => {
  it('OVERLOADED repete uma vez, com nonce novo', async () => {
    const nonces: string[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      nonces.push((init.headers as Record<string, string>)['X-Kizuna-Nonce']);
      if (nonces.length === 1) return new Response(JSON.stringify({ code: 'OVERLOADED' }), { status: 503 });
      return new Response(JSON.stringify({ price: 300 }), { status: 200 });
    }) as typeof fetch;
    assert.deepEqual(await client.call('/internal/v1/x'), { ok: true, price: 300 });
    assert.equal(nonces.length, 2);
    assert.notEqual(nonces[0], nonces[1]);
  });

  it('outro 503 não repete', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ code: 'NOT_READY' }), { status: 503 });
    }) as typeof fetch;
    await assert.rejects(client.call('/internal/v1/x'));
    assert.equal(calls, 1);
  });
});
