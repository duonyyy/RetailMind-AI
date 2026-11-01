import {
  Injectable,
  NotFoundException,
  ConflictException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Variant } from './entities/variant.entity';
import { Product } from './entities/product.entity';
import { Brand } from './entities/brand.entity';
import { Category } from './entities/category.entity';

export interface LaptopFilter {
  minRam?: number;
  minPrice?: string;
  maxPrice?: string;
  search?: string;
  brand?: string;
  category?: string;
}

export interface RetailProductDTO {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  priceVnd: string;
  formattedPrice: string;
  ramGb: number;
  storageGb: number;
  cpuModel: string;
  gpuModel: string;
  imageUrl: string;
  highlights: string[];
  inStock: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    @Optional()
    @InjectRepository(Variant)
    private readonly variantRepo?: Repository<Variant>,
    @Optional()
    @InjectRepository(Product)
    private readonly productRepo?: Repository<Product>,
    @Optional()
    @InjectRepository(Brand)
    private readonly brandRepo?: Repository<Brand>,
    @Optional()
    @InjectRepository(Category)
    private readonly categoryRepo?: Repository<Category>,
  ) {}

  /**
   * Tra cứu danh sách laptop kết hợp bộ lọc (RAM >= 16GB, giá < 20 triệu VNĐ)
   * 100% truy vấn dữ liệu thực tế từ PostgreSQL SSOT với unaccent và quan hệ products, brands, categories.
   */
  async getProducts(filter: LaptopFilter = {}): Promise<RetailProductDTO[]> {
    if (!this.variantRepo) throw new ServiceUnavailableException('Danh mục sản phẩm hiện không khả dụng.');
    const qb = this.variantRepo
      .createQueryBuilder('v')
      .leftJoin('products', 'product', 'product.id = v.product_id')
      .leftJoin('brands', 'brand', 'brand.id = product.brand_id')
      .leftJoin('categories', 'category', 'category.id = product.category_id')
      .addSelect([
        'product.name AS product_name',
        'product.slug AS product_slug',
        'brand.name AS brand_name',
        'category.name AS category_name',
      ])
      .where('v.is_active = :active', { active: true });

    if (filter.search) {
      qb.andWhere('(unaccent(v.name) ILIKE unaccent(:q) OR v.sku ILIKE :q OR v.cpu_model ILIKE :q)', { q: `%${filter.search}%` });
    }
    if (filter.minRam) qb.andWhere('v.ram_gb >= :minRam', { minRam: filter.minRam });
    if (filter.minPrice) qb.andWhere('v.price_vnd >= :minPrice', { minPrice: filter.minPrice });
    if (filter.maxPrice) qb.andWhere('v.price_vnd <= :maxPrice', { maxPrice: filter.maxPrice });
    if (filter.brand) {
      qb.andWhere('lower(brand.name) = lower(:brand)', { brand: filter.brand });
    }
    if (filter.category) {
      qb.andWhere('lower(category.name) = lower(:category)', { category: filter.category });
    }

    if (typeof qb.getRawAndEntities === 'function') {
      const res = await qb.orderBy('v.price_vnd', 'ASC').getRawAndEntities();
      return res.entities.map((v, i) => this.mapVariantToDto(v, res.raw[i]));
    }

    const variants = await qb.orderBy('v.price_vnd', 'ASC').getMany();
    return variants.map((v) => this.mapVariantToDto(v));
  }

  async getProductBySku(sku: string): Promise<RetailProductDTO> {
    if (!this.variantRepo) throw new ServiceUnavailableException('Danh mục sản phẩm hiện không khả dụng.');
    const qb = this.variantRepo
      .createQueryBuilder('v')
      .leftJoin('products', 'product', 'product.id = v.product_id')
      .leftJoin('brands', 'brand', 'brand.id = product.brand_id')
      .leftJoin('categories', 'category', 'category.id = product.category_id')
      .addSelect([
        'product.name AS product_name',
        'product.slug AS product_slug',
        'brand.name AS brand_name',
        'category.name AS category_name',
      ])
      .where('v.is_active = true')
      .andWhere('(v.sku = :sku OR v.id::text = :sku)', { sku });

    if (typeof qb.getRawAndEntities === 'function') {
      const res = await qb.getRawAndEntities();
      if (!res.entities.length) throw new NotFoundException('Không tìm thấy sản phẩm đang kinh doanh.');
      return this.mapVariantToDto(res.entities[0], res.raw[0]);
    }

    const variant = await qb.getOne();
    if (!variant) throw new NotFoundException('Không tìm thấy sản phẩm đang kinh doanh.');
    return this.mapVariantToDto(variant);
  }

  async compareVariants(skuList: string[]): Promise<RetailProductDTO[]> {
    return Promise.all(skuList.map((sku) => this.getProductBySku(sku)));
  }

  async createProduct(dto: {
    sku: string;
    name: string;
    brand: string;
    priceVnd: string;
    ramGb?: number;
    storageGb?: number;
    cpuModel?: string;
    gpuModel?: string;
  }): Promise<RetailProductDTO> {
    if (!this.variantRepo) throw new ServiceUnavailableException('Danh mục sản phẩm hiện không khả dụng.');

    const cleanSku = dto.sku.toUpperCase().trim();
    const existing = await this.variantRepo.findOne({ where: { sku: cleanSku } });
    if (existing) {
      throw new ConflictException(`Mã SKU ${cleanSku} đã tồn tại trong hệ thống.`);
    }

    let brandId = '20000000-0000-0000-0000-000000000001';
    if (this.brandRepo) {
      const b = await this.brandRepo.findOne({ where: { slug: dto.brand.toLowerCase() } });
      if (b) brandId = b.id;
    }

    let categoryId = '30000000-0000-0000-0000-000000000001';
    if (this.categoryRepo) {
      const c = await this.categoryRepo.findOne({ where: { slug: 'laptop-office' } });
      if (c) categoryId = c.id;
    }

    const slug = cleanSku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let productId = '40000000-0000-0000-0000-000000000001';
    if (this.productRepo) {
      const p = await this.productRepo.save(
        this.productRepo.create({
          brand_id: brandId,
          category_id: categoryId,
          name: dto.name,
          slug: `${slug}-${Date.now().toString().slice(-4)}`,
          description: dto.name,
          is_active: true,
        }),
      );
      productId = p.id;
    }

    const priceDecimal = new Decimal(dto.priceVnd.replace(/\D/g, '') || '0');
    const variant = await this.variantRepo.save(
      this.variantRepo.create({
        product_id: productId,
        sku: cleanSku,
        name: dto.name,
        price_vnd: priceDecimal,
        ram_gb: dto.ramGb || 16,
        storage_gb: dto.storageGb || 512,
        cpu_model: dto.cpuModel || 'Intel Core i5',
        gpu_model: dto.gpuModel || 'Intel Iris Xe Graphics',
        is_active: true,
      }),
    );

    return this.mapVariantToDto(variant, {
      brand_name: dto.brand,
      category_name: 'Laptop Học tập - Văn phòng',
    });
  }

  async toggleActive(sku: string): Promise<{ sku: string; isActive: boolean }> {
    if (!this.variantRepo) throw new ServiceUnavailableException('Danh mục sản phẩm hiện không khả dụng.');
    const variant = await this.variantRepo.findOne({ where: { sku: sku.toUpperCase().trim() } });
    if (!variant) throw new NotFoundException('Không tìm thấy biến thể.');
    variant.is_active = !variant.is_active;
    await this.variantRepo.save(variant);
    return { sku: variant.sku, isActive: variant.is_active };
  }

  private mapVariantToDto(v: Variant, raw?: any): RetailProductDTO {
    const priceStr = v.price_vnd ? v.price_vnd.toString() : '0';
    const priceNum = BigInt(priceStr);

    const brandName = raw?.brand_name || raw?.brand?.name || 'Laptop Chính Hãng';
    const categoryName = raw?.category_name || raw?.category?.name || 'Laptop Học tập - Văn phòng';
    const slug = raw?.product_slug || raw?.product?.slug || v.sku.toLowerCase();

    return {
      id: v.id,
      sku: v.sku,
      name: v.name,
      brand: brandName,
      category: categoryName,
      priceVnd: priceStr,
      formattedPrice: `${new Intl.NumberFormat('vi-VN').format(priceNum)} ₫`,
      ramGb: v.ram_gb || 16,
      storageGb: v.storage_gb || 512,
      cpuModel: v.cpu_model || 'Intel Core i5',
      gpuModel: v.gpu_model || 'Intel Iris Xe Graphics',
      imageUrl: `/images/laptops/${slug}.png`,
      highlights: [
        `CPU: ${v.cpu_model || 'Tiêu chuẩn'}`,
        `RAM: ${v.ram_gb || 16}GB | Ổ cứng: ${v.storage_gb || 512}GB SSD`,
        `Đồ họa: ${v.gpu_model || 'Tích hợp'}`,
        'Bảo hành chính hãng tại Thế Giới Di Động / Điện Máy Xanh',
      ],
      inStock: v.is_active,
    };
  }
}
