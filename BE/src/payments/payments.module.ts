import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrderingModule } from '../ordering/ordering.module.js';
import { ShiftsModule } from '../shifts/shifts.module.js';
import { FulfillmentModule } from '../fulfillment/fulfillment.module.js';
import {
  PaymentsController,
  RefundsController,
  VietQrWebhooksController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { VietQrService } from './vietqr.service.js';
@Module({
  imports: [JwtModule.register({}), OrderingModule, ShiftsModule, FulfillmentModule],
  controllers: [PaymentsController, RefundsController, VietQrWebhooksController],
  providers: [PaymentsService, VietQrService],
})
export class PaymentsModule {}
