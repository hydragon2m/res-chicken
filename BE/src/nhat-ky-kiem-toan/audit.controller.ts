import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';
import { ListAuditLogsDto } from './du-lieu-dau-vao/list-audit-logs.dto.js';
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
