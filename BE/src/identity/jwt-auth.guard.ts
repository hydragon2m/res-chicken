import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import { EventsService } from '../events/events.service.js';
import { IS_PUBLIC_KEY } from './decorators/public.decorator.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly eventsService: EventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      query?: { token?: string; accessToken?: string; ticket?: string };
      user?: AuthenticatedUser;
    }>();

    // SEC-002: Ephemeral single-use stream ticket (consumed once)
    const ticket = request.query?.ticket;
    if (ticket) {
      const ticketUser = this.eventsService.consumeStreamTicket(ticket);
      if (!ticketUser) {
        throw new UnauthorizedException('Stream ticket không hợp lệ hoặc đã hết hạn.');
      }
      request.user = ticketUser;
      return true;
    }

    let token = '';
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, bearerToken] = authHeader.split(' ');
      if (type === 'Bearer' && bearerToken) token = bearerToken;
    }
    if (!token && request.query) {
      token = (request.query.token || request.query.accessToken) ?? '';
    }
    if (!token) throw new UnauthorizedException();

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        sid: string;
        authVersion: number;
      }>(token);
      const user = await this.authService.getAuthenticatedUser(payload);
      if (!user) throw new UnauthorizedException();
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException();
    }
  }
}
