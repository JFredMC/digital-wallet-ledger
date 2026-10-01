import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import { User } from './entities/user.entity';

const PG_UNIQUE_VIOLATION = '23505';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Pass the transaction's manager when called inside one (see AccountsService.findRecipient). */
  findById(id: string, manager?: EntityManager): Promise<User | null> {
    return (manager ? manager.getRepository(User) : this.users).findOneBy({ id });
  }

  /** Loads a user including the (normally hidden) password hash. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  /** Pass the caller's transaction manager to create the user atomically with other rows. */
  async create(input: CreateUserInput, manager?: EntityManager): Promise<User> {
    const repo = manager ? manager.getRepository(User) : this.users;
    try {
      return await repo.save(repo.create(input));
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
      ) {
        throw new DomainError(
          'EMAIL_ALREADY_REGISTERED',
          'An account with this email already exists.',
        );
      }
      throw error;
    }
  }

  /**
   * Atomically counts a failed login; once `maxAttempts` is reached the user is
   * locked for `lockMinutes` and the counter restarts.
   */
  async registerFailedLogin(
    userId: string,
    maxAttempts: number,
    lockMinutes: number,
  ): Promise<void> {
    await this.users.query(
      `UPDATE users
          SET failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= $2 THEN 0
                                           ELSE failed_login_attempts + 1 END,
              locked_until = CASE WHEN failed_login_attempts + 1 >= $2
                                  THEN now() + make_interval(mins => $3)
                                  ELSE locked_until END,
              updated_at = now()
        WHERE id = $1`,
      [userId, maxAttempts, lockMinutes],
    );
  }

  async resetFailedLogins(userId: string): Promise<void> {
    await this.users.update({ id: userId }, { failedLoginAttempts: 0, lockedUntil: null });
  }
}
