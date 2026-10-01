import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** RFC 9457 "problem details" body returned for every error. */
export class ProblemDetailsDto {
  @ApiProperty({ example: 'https://errors.wallet.dev/invalid-credentials' })
  type!: string;

  @ApiProperty({ example: 'Invalid credentials' })
  title!: string;

  @ApiProperty({ example: 401 })
  status!: number;

  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  code!: string;

  @ApiProperty({ example: 'Email or password is incorrect.' })
  detail!: string;

  @ApiProperty({ example: '/api/v1/auth/login' })
  instance!: string;

  @ApiProperty({ example: '0b6e6a1e-4a59-4a8b-9a51-6f0c2b8d7e10' })
  requestId!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['password must be longer than or equal to 8 characters'],
  })
  errors?: string[];
}
