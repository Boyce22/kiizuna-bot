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
