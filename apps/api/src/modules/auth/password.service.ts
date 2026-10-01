import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/** OWASP-recommended argon2id baseline: 19 MiB memory, 2 iterations, 1 lane. */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /**
   * Burns the same CPU time as a real verification. Used when the user does not
   * exist (or cannot log in) so response times do not reveal registered emails.
   */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('dummy-password-for-timing-equalization');
    await this.verify(await this.dummyHash, password);
  }
}
