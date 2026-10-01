import { decodeCursor, encodeCursor } from './cursor';

describe('keyset cursor', () => {
  const cursor = { createdAt: '2026-10-01T14:37:07.986123Z', id: '42' };

  it('round-trips and is URL-safe', () => {
    const encoded = encodeCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ['garbage', 'not-a-cursor!'],
    ['non-JSON base64', Buffer.from('hello').toString('base64url')],
    ['wrong shape', Buffer.from('{"a":1}').toString('base64url')],
    [
      'millisecond timestamp',
      Buffer.from('["2026-10-01T14:37:07.986Z","1"]').toString('base64url'),
    ],
    [
      'non-numeric id',
      Buffer.from('["2026-10-01T14:37:07.986123Z","1; DROP"]').toString('base64url'),
    ],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeCursor(value)).toThrow(expect.objectContaining({ code: 'INVALID_CURSOR' }));
  });
});
