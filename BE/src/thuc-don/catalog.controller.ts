import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CreateCategoryDto } from './du-lieu-dau-vao/create-category.dto.js';
import { CreateOptionDto } from './du-lieu-dau-vao/create-option.dto.js';
import { CreateOptionGroupDto } from './du-lieu-dau-vao/create-option-group.dto.js';
import { CreatePriceDto } from './du-lieu-dau-vao/create-price.dto.js';
import { CreateProductDto } from './du-lieu-dau-vao/create-product.dto.js';
import { CreateVariantDto } from './du-lieu-dau-vao/create-variant.dto.js';
import { LinkOptionGroupDto } from './du-lieu-dau-vao/link-option-group.dto.js';
import { SetSoldOutDto } from './du-lieu-dau-vao/set-sold-out.dto.js';
import { UpdateCategoryDto } from './du-lieu-dau-vao/update-category.dto.js';
import { UpdateOptionDto } from './du-lieu-dau-vao/update-option.dto.js';
import { UpdateOptionGroupDto } from './du-lieu-dau-vao/update-option-group.dto.js';
import { UpdatePriceDto } from './du-lieu-dau-vao/update-price.dto.js';
import { UpdateProductDto } from './du-lieu-dau-vao/update-product.dto.js';
import { UpdateVariantDto } from './du-lieu-dau-vao/update-variant.dto.js';
import { CurrentUser } from '../xac-thuc-phan-quyen/bo-trang-tri/current-user.decorator.js';
import { RequirePermissions } from '../xac-thuc-phan-quyen/bo-trang-tri/require-permissions.decorator.js';
import type { AuthenticatedUser } from '../xac-thuc-phan-quyen/kieu-du-lieu/authenticated-user.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @RequirePermissions('catalog.read') @Get('categories') list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.catalog.listCategories(actor, storeId);
  }
  @RequirePermissions('catalog.manage') @Post('categories') create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.catalog.createCategory(actor, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('categories/:categoryId') updateCategory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalog.updateCategory(actor, categoryId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('categories/:categoryId') deleteCategory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
  ) {
    return this.catalog.deleteCategory(actor, categoryId);
  }

  @RequirePermissions('catalog.read') @Get('products') products(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.catalog.listProducts(actor, storeId);
  }
  @RequirePermissions('catalog.manage') @Post('products') createProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.catalog.createProduct(actor, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('products/:productId') updateProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalog.updateProduct(actor, productId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('products/:productId') deleteProduct(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ) {
    return this.catalog.deleteProduct(actor, productId);
  }
  @RequirePermissions('catalog.manage') @Post('products/:productId/variants') createVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.catalog.createVariant(actor, productId, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('variants/:variantId') updateVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.catalog.updateVariant(actor, variantId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('variants/:variantId') deleteVariant(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
  ) {
    return this.catalog.deleteVariant(actor, variantId);
  }

  @RequirePermissions('catalog.read') @Get('option-groups') optionGroups(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.catalog.listOptionGroups(actor, storeId);
  }
  @RequirePermissions('catalog.manage') @Post('option-groups') createOptionGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateOptionGroupDto,
  ) {
    return this.catalog.createOptionGroup(actor, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('option-groups/:optionGroupId') updateOptionGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionGroupId', new ParseUUIDPipe()) optionGroupId: string,
    @Body() dto: UpdateOptionGroupDto,
  ) {
    return this.catalog.updateOptionGroup(actor, optionGroupId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('option-groups/:optionGroupId') deleteOptionGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionGroupId', new ParseUUIDPipe()) optionGroupId: string,
  ) {
    return this.catalog.deleteOptionGroup(actor, optionGroupId);
  }
  @RequirePermissions('catalog.manage') @Post('option-groups/:optionGroupId/options') createOption(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionGroupId', new ParseUUIDPipe()) optionGroupId: string,
    @Body() dto: CreateOptionDto,
  ) {
    return this.catalog.createOption(actor, optionGroupId, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('options/:optionId') updateOption(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.catalog.updateOption(actor, optionId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('options/:optionId') deleteOption(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
  ) {
    return this.catalog.deleteOption(actor, optionId);
  }

  @RequirePermissions('catalog.manage') @Patch('products/:productId/sold-out') setSoldOut(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: SetSoldOutDto,
  ) {
    return this.catalog.setProductSoldOut(actor, productId, dto.isSoldOut);
  }
  @RequirePermissions('catalog.manage') @Patch('variants/:variantId/sold-out') setVariantSoldOut(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body() dto: SetSoldOutDto,
  ) {
    return this.catalog.setVariantSoldOut(actor, variantId, dto.isSoldOut);
  }
  @RequirePermissions('catalog.manage') @Patch('options/:optionId/sold-out') setOptionSoldOut(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('optionId', new ParseUUIDPipe()) optionId: string,
    @Body() dto: SetSoldOutDto,
  ) {
    return this.catalog.setOptionSoldOut(actor, optionId, dto.isSoldOut);
  }
  @RequirePermissions('catalog.manage') @Post('products/:productId/option-groups') linkGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: LinkOptionGroupDto,
  ) {
    return this.catalog.linkOptionGroup(actor, productId, dto);
  }
  @RequirePermissions('catalog.manage')
  @Delete('products/:productId/option-groups/:optionGroupId')
  unlinkGroup(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Param('optionGroupId', new ParseUUIDPipe()) optionGroupId: string,
  ) {
    return this.catalog.unlinkOptionGroup(actor, productId, optionGroupId);
  }

  @RequirePermissions('catalog.read') @Get('price-schedules') listPrices(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.catalog.listPrices(actor, storeId);
  }
  @RequirePermissions('catalog.manage') @Post('price-schedules') createPrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreatePriceDto,
  ) {
    return this.catalog.createPrice(actor, dto);
  }
  @RequirePermissions('catalog.manage') @Patch('price-schedules/:priceId') updatePrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
    @Body() dto: UpdatePriceDto,
  ) {
    return this.catalog.updatePrice(actor, priceId, dto);
  }
  @RequirePermissions('catalog.manage') @Delete('price-schedules/:priceId') deletePrice(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
  ) {
    return this.catalog.deletePrice(actor, priceId);
  }
  @RequirePermissions('catalog.read') @Get('menu') menu(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('storeId', new ParseUUIDPipe()) storeId: string,
  ) {
    return this.catalog.menu(actor, storeId);
  }
}
