import { Public } from '../../shared/decorators/public.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Controller, Get, Post, Query, Param, Body } from '@nestjs/common';
import { CatalogService, LaptopFilter } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Public()
  @Get('products')
  async getProducts(
    @Query('search') search?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('minRam') minRam?: string,
    @Query('brand') brand?: string,
    @Query('category') category?: string,
  ) {
    const filter: LaptopFilter = {
      search,
      minPrice,
      maxPrice,
      minRam: minRam ? parseInt(minRam, 10) : undefined,
      brand,
      category,
    };
    const items = await this.catalogService.getProducts(filter);
    return {
      items,
      total: items.length,
    };
  }

  @Public()
  @Get('products/:sku')
  async getProductBySku(@Param('sku') sku: string) {
    return this.catalogService.getProductBySku(sku);
  }

  @Public()
  @Get('compare')
  async compareProducts(@Query('skus') skus: string) {
    const skuList = (skus || '').split(',').map((s) => s.trim()).filter(Boolean);
    return this.catalogService.compareVariants(skuList);
  }

  @Roles('ADMIN')
  @Post('products')
  async createProduct(@Body() dto: any) {
    return this.catalogService.createProduct(dto);
  }

  @Roles('ADMIN')
  @Post('products/:sku/toggle')
  async toggleActive(@Param('sku') sku: string) {
    return this.catalogService.toggleActive(sku);
  }
}
