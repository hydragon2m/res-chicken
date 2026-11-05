import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { FulfillmentController } from './fulfillment.controller.js';
import { FulfillmentService } from './fulfillment.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
