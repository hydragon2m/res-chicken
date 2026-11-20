import { Module } from '@nestjs/common';
import { CatalogModule } from '../thuc-don/catalog.module.js';
import { OrderingModule } from '../don-hang/ordering.module.js';
import { ReservationsController, TablesController } from './tables.controller.js';
import { ReservationsPublicController } from './reservations-public.controller.js';
import { TableOrderingController } from './table-ordering.controller.js';
import { TablesService } from './tables.service.js';

@Module({
  imports: [CatalogModule, OrderingModule],
  controllers: [
    TablesController,
    ReservationsController,
    ReservationsPublicController,
    TableOrderingController,
  ],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
