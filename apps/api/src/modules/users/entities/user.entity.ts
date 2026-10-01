import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext' })
  email!: string;

  /** argon2id hash. Never selected unless explicitly requested. */
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'USER' })
  role!: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: UserStatus;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
