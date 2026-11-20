import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OrderingModule } from '../don-hang/ordering.module.js';
import { ShiftsModule } from '../ca-lam-viec/shifts.module.js';
import { FulfillmentModule } from '../dieu-phoi-bep/fulfillment.module.js';
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
