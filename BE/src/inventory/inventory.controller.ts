import { Body, Controller, Get, Headers, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../identity/decorators/current-user.decorator.js';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../identity/types/authenticated-user.js';
import { CreateCountDto } from './dto/create-count.dto.js';
import { CreateIngredientDto } from './dto/create-ingredient.dto.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { CreateReceiptDto } from './dto/create-receipt.dto.js';
import { CreateRecipeDto } from './dto/create-recipe.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { CreateTransferDto } from './dto/create-transfer.dto.js';
import { CreateWasteDto } from './dto/create-waste.dto.js';
import { InventoryAlertsDto } from './dto/inventory-alerts.dto.js';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions('inventory.read')
  @Get('suppliers')
  suppliers(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listSuppliers(actor, storeId);
  }

  @RequirePermissions('inventory.manage')
  @Post('suppliers')
  createSupplier(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(actor, dto);
  }

  @RequirePermissions('inventory.read')
  @Get('locations')
  locations(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listLocations(actor, storeId);
  }

  @RequirePermissions('inventory.manage')
  @Post('locations')
  createLocation(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateLocationDto) {
    return this.inventory.createLocation(actor, dto);
  }

  @RequirePermissions('inventory.read')
  @Get('ingredients')
  ingredients(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listIngredients(actor, storeId);
  }

  @RequirePermissions('inventory.manage')
  @Post('ingredients')
  createIngredient(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateIngredientDto) {
    return this.inventory.createIngredient(actor, dto);
  }

  @RequirePermissions('inventory.read')
  @Get('receipts')
  receipts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listReceipts(actor, storeId);
  }

  @RequirePermissions('inventory.manage')
  @Post('receipts')
  receive(
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateReceiptDto,
  ) {
    return this.inventory.receive(actor, key, dto);
  }

  @RequirePermissions('inventory.manage')
  @Post('transfers')
  transfer(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTransferDto) {
    return this.inventory.transfer(actor, dto);
  }

  @RequirePermissions('inventory.manage')
  @Post('counts')
  count(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateCountDto) {
    return this.inventory.count(actor, dto);
  }

  @RequirePermissions('inventory.manage')
  @Post('wastes')
  waste(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateWasteDto) {
    return this.inventory.waste(actor, dto);
  }

  @RequirePermissions('inventory.read')
  @Get('alerts')
  alerts(@CurrentUser() actor: AuthenticatedUser, @Query() dto: InventoryAlertsDto) {
    return this.inventory.alerts(actor, dto.storeId, dto.expiryDays);
  }

  @RequirePermissions('inventory.read')
  @Get('stock')
  stock(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.inventory.stock(actor, storeId, locationId);
  }

  @RequirePermissions('inventory.read')
  @Get('ledger')
  ledger(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.ledger(actor, storeId);
  }

  @RequirePermissions('inventory.read')
  @Get('recipes')
  recipes(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listRecipes(actor, storeId);
  }

  @RequirePermissions('inventory.read')
  @Get('recipe-products')
  recipeProducts(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.inventory.listRecipeProducts(actor, storeId);
  }

  @RequirePermissions('inventory.manage')
  @Post('recipes')
  createRecipe(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRecipeDto) {
    return this.inventory.createRecipe(actor, dto);
  }
}
