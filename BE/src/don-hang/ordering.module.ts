import { Module } from '@nestjs/common';
import { CatalogModule } from '../thuc-don/catalog.module.js';
import { InventoryModule } from '../kho-nguyen-lieu/inventory.module.js';
import { PromotionsModule } from '../khuyen-mai/promotions.module.js';
import { OrderingController } from './ordering.controller.js';
import { OrderingService } from './ordering.service.js';

@Module({
  imports: [CatalogModule, InventoryModule, PromotionsModule],
  controllers: [OrderingController],
  providers: [OrderingService],
  exports: [OrderingService],
})
export class OrderingModule {}
