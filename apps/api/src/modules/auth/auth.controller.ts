import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { DomainError } from '../../common/errors/domain-error';
import { ProblemDetailsDto } from '../../common/filters/problem-details.dto';
import type { Env } from '../../config/env.schema';
import { UserDto } from '../users/dto/user.dto';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TrustedOriginGuard } from './guards/trusted-origin.guard';
import type { ClientMeta, IssuedRefreshToken } from './token.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Create an account',
    description: 'Creates the user and starts a session (access token + refresh cookie).',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ type: ProblemDetailsDto, description: 'EMAIL_ALREADY_REGISTERED' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.register(dto, clientMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return result.body;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in',
    description: `Generic error for any failure. The account is temporarily locked after repeated failures.`,
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ProblemDetailsDto, description: 'VALIDATION_FAILED' })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'INVALID_CREDENTIALS' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.login(dto, clientMeta(req));
    this.setRefreshCookie(res, result.refreshToken);
    return result.body;
  }

  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Uses the HttpOnly refresh cookie (single use). Returns a new access token and sets a new cookie. ' +
      'Presenting an already-used token revokes the whole session family.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    type: ProblemDetailsDto,
    description: 'INVALID_REFRESH_TOKEN | REFRESH_TOKEN_REUSED',
  })
  @ApiForbiddenResponse({ type: ProblemDetailsDto, description: 'UNTRUSTED_ORIGIN' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const raw = readRefreshCookie(req);
    if (!raw) {
      throw new DomainError('INVALID_REFRESH_TOKEN', 'No active session.');
    }
    try {
      const result = await this.auth.refresh(raw, clientMeta(req));
      this.setRefreshCookie(res, result.refreshToken);
      return result.body;
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @UseGuards(TrustedOriginGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({ summary: 'Log out', description: 'Revokes the current refresh token.' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ type: ProblemDetailsDto, description: 'UNTRUSTED_ORIGIN' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const raw = readRefreshCookie(req);
    if (raw) await this.auth.logout(raw);
    this.clearRefreshCookie(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user profile' })
  @ApiOkResponse({ type: UserDto })
  @ApiUnauthorizedResponse({ type: ProblemDetailsDto, description: 'UNAUTHORIZED' })
  me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.auth.me(user.id);
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    };
  }

  private setRefreshCookie(res: Response, token: IssuedRefreshToken): void {
    res.cookie(REFRESH_COOKIE_NAME, token.value, {
      ...this.cookieOptions(),
      expires: token.expiresAt,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }
}

function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 && value.length <= 256 ? value : undefined;
}

function clientMeta(req: Request): ClientMeta {
  return { userAgent: req.header('user-agent') ?? null, ip: req.ip ?? null };
}
