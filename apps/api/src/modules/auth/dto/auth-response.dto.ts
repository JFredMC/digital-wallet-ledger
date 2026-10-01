import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../../users/dto/user.dto';

/**
 * Returned by register, login and refresh. The refresh token is NOT in the body:
 * it travels only in an HttpOnly cookie scoped to /api/v1/auth.
 */
export class AuthResponseDto {
  @ApiProperty({ description: 'Short-lived JWT (keep it in memory only).' })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds.' })
  expiresIn!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
