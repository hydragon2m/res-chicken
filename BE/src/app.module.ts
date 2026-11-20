import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './co-so-du-lieu/database.module.js';
import { HealthModule } from './kiem-tra-he-thong/health.module.js';
import { IdentityModule } from './xac-thuc-phan-quyen/identity.module.js';
import { CatalogModule } from './thuc-don/catalog.module.js';
import { OrderingModule } from './don-hang/ordering.module.js';
import { PaymentsModule } from './thanh-toan/payments.module.js';
import { ShiftsModule } from './ca-lam-viec/shifts.module.js';
import { FulfillmentModule } from './dieu-phoi-bep/fulfillment.module.js';
import { ReportsModule } from './bao-cao/reports.module.js';
import { InventoryModule } from './kho-nguyen-lieu/inventory.module.js';
import { AuditModule } from './nhat-ky-kiem-toan/audit.module.js';
import { EventsModule } from './su-kien/events.module.js';
import { PromotionsModule } from './khuyen-mai/promotions.module.js';
import { TablesModule } from './ban-va-dat-cho/tables.module.js';
import { SettingsModule } from './cai-dat/settings.module.js';
import { StoresModule } from './chi-nhanh/stores.module.js';
import { validateEnvironment } from './cau-hinh/environment.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    EventsModule,
    AuditModule,
    IdentityModule,
    HealthModule,
    CatalogModule,
    OrderingModule,
    PromotionsModule,
    TablesModule,
    SettingsModule,
    StoresModule,
    ShiftsModule,
    FulfillmentModule,
    PaymentsModule,
    ReportsModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
