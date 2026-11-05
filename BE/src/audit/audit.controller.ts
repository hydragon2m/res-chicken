import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';
import { AuditService } from './audit.service.js';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions('audit.read')
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() dto: ListAuditLogsDto) {
    return this.audit.list(actor, dto);
  }
}
