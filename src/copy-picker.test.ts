import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { copyLabel, parseCardRef } from './commands/copy-picker';

describe('copy-picker', () => {
  it('#12 é a cópia; um número sozinho é o personagem; o resto não vale', () => {
    assert.deepEqual(parseCardRef('#12'), { cardId: 12 });
    assert.deepEqual(parseCardRef('34'), { characterId: 34 });
    assert.equal(parseCardRef('rem'), null);
    assert.equal(parseCardRef('#'), null);
    assert.equal(parseCardRef('0'), null);
    assert.equal(parseCardRef(undefined), null);
  });

  it('rótulo da cópia: id, selo da qualidade, multiplicador e passiva', () => {
    const label = copyLabel({
      cardId: 123,
      quality: 3,
      giftMult: 1.27,
      passiveId: 'pele-de-aco',
      passiveName: 'Pele de aço',
      passiveValue: 9.4,
      bond: 0,
    });
    assert.equal(label, '#123 · 極 · ×1.27 · Pele de aço 9.4%');
  });
});
