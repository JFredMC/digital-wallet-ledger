import { ApiProperty } from '@nestjs/swagger';
import { USER_ROLES, type User, type UserRole } from '../entities/user.entity';

/** Public representation of a user (never exposes the password hash). */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ana María Gómez' })
  fullName!: string;

  @ApiProperty({ enum: USER_ROLES, example: 'USER' })
  role!: UserRole;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  static fromEntity(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
