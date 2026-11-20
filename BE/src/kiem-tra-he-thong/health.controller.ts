import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../co-so-du-lieu/prisma.service.js';
import { Public } from '../xac-thuc-phan-quyen/bo-trang-tri/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
