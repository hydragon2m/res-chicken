import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { OrderingController } from './ordering.controller.js';
import { OrderingService } from './ordering.service.js';

@Module({
  imports: [CatalogModule, InventoryModule, PromotionsModule],
  controllers: [OrderingController],
  providers: [OrderingService],
  exports: [OrderingService],
})
export class OrderingModule {}
