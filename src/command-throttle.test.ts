import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CommandThrottle } from './command-throttle';

describe('CommandThrottle', () => {
  it('deixa passar até o limite, avisa uma vez e depois descarta em silêncio', () => {
    const throttle = new CommandThrottle(2, 10_000);
    const verdicts = [0, 1, 2, 3, 4].map(() => throttle.take('u1', 1_000));
    assert.deepEqual(verdicts, ['ok', 'ok', 'warn', 'drop', 'drop']);
    assert.equal(throttle.take('u2', 1_000), 'ok');
  });

  it('a janela reabre depois do prazo', () => {
    const throttle = new CommandThrottle(1, 10_000);
    assert.equal(throttle.take('u1', 0), 'ok');
    assert.equal(throttle.take('u1', 5_000), 'warn');
    assert.equal(throttle.retryAfterSeconds('u1', 5_000), 5);
    assert.equal(throttle.take('u1', 10_000), 'ok');
  });

  it('não cresce sem teto com muitos usuários', () => {
    const throttle = new CommandThrottle(1, 10_000, 3);
    for (let i = 0; i < 10; i++) throttle.take(`u${i}`, 0);
    assert.equal(throttle.take('u0', 0), 'ok');
  });
});
