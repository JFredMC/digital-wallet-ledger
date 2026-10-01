import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies the original password', async () => {
    const hash = await service.hash('S3cure-passw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('S3cure-passw0rd');
    await expect(service.verify(hash, 'S3cure-passw0rd')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password1')).resolves.toBe(false);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    await expect(service.verify('not-a-hash', 'whatever')).resolves.toBe(false);
  });

  it('can run a dummy verification without throwing', async () => {
    await expect(service.verifyAgainstDummy('anything')).resolves.toBeUndefined();
  });
});
