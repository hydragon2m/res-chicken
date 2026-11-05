import { Body, Controller, Get, ParseIntPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../identity/decorators/public.decorator.js';
import { PublicReservationDto } from './dto/create-reservation.dto.js';
import { TablesService } from './tables.service.js';

@Controller('reservations/public')
export class ReservationsPublicController {
  constructor(private readonly tables: TablesService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('stores')
  listPublicStores() {
    return this.tables.listPublicStores();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('availability')
  checkAvailability(
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('date') date: string,
    @Query('guestCount', ParseIntPipe) guestCount: number,
  ) {
    return this.tables.checkPublicAvailability(storeId, date, guestCount);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  createPublicReservation(@Body() dto: PublicReservationDto) {
    return this.tables.createPublicReservation(dto);
  }
}
