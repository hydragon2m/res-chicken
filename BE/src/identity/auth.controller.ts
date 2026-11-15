import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { RequirePermissions } from './decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto.email, dto.password);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Post('refresh')
  async refresh(
    @Req() request: { headers: { cookie?: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.headers.cookie
      ?.split('; ')
      .find((cookie) => cookie.startsWith('refresh_token='))
      ?.slice('refresh_token='.length);
    if (!refreshToken) throw new UnauthorizedException();
    const result = await this.authService.refresh(decodeURIComponent(refreshToken));
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.sessionId);
    response.clearCookie('refresh_token', this.cookieOptions());
    return { status: 'ok' };
  }

  private setRefreshCookie(response: Response, token: string) {
    response.cookie('refresh_token', token, { ...this.cookieOptions(), maxAge: 2_592_000_000 });
  }

  private cookieOptions() {
    // Local Compose is served over HTTP. Production deployments must set
    // COOKIE_SECURE=true behind HTTPS so browsers only send the refresh token securely.
    return {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
    };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  @Get('stores')
  stores(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listAccessibleStores(user);
  }

  @RequirePermissions('identity.read')
  @Get('users')
  listUsers(@CurrentUser() actor: AuthenticatedUser) {
    return this.authService.listUsers(actor);
  }

  @RequirePermissions('identity.manage')
  @Post('users')
  createUser(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.authService.createUser(actor, dto);
  }

  @RequirePermissions('identity.manage')
  @Patch('users/:userId')
  updateUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.authService.updateUser(actor, userId, dto);
  }
}
