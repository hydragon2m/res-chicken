import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { OrderingModule } from './ordering/ordering.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { ShiftsModule } from './shifts/shifts.module.js';
import { FulfillmentModule } from './fulfillment/fulfillment.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { AuditModule } from './audit/audit.module.js';
import { EventsModule } from './events/events.module.js';
import { PromotionsModule } from './promotions/promotions.module.js';
import { TablesModule } from './tables/tables.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StoresModule } from './stores/stores.module.js';
import { validateEnvironment } from './config/environment.js';

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
