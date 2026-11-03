import { apiFetch } from '@/lib/api-client';
import { formatVND, parseVndBigInt } from '@/lib/utils';
import { LaptopProduct, CatalogFilterParams, BranchStockItem } from '../types';

/**
 * Deterministic Baseline Catalog (SSOT Seed Mirror)
 * Used as graceful offline fallback when Core API is completely unreachable.
 */
export const BASELINE_LAPTOP_CATALOG: LaptopProduct[] = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    sku: 'LT-ASUS-VIVO15-OLED',
    name: 'Laptop Asus Vivobook 15 OLED A1505VA',
    brand: 'ASUS',
    category: 'Laptop Học tập - Văn phòng',
    useCase: 'OFFICE',
    priceVnd: '17990000',
    originalPriceVnd: '19990000',
    formattedPrice: formatVND('17990000'),
    ramGb: 16,
    ramType: '16GB DDR4 3200MHz (Nâng cấp tối đa 24GB)',
    storageGb: 512,
    storageType: '512GB M.2 PCIe Gen 4 NVMe SSD',
    cpuModel: 'Intel Core i5-13500H (12 nhân, 16 luồng, 4.7GHz)',
    cpuScore: 86,
    gpuModel: 'Chưa xác nhận',
    gpuScore: 68,
    displaySpec: '15.6" 2.8K (2880x1620) OLED 120Hz, 600 nits HDR',
    colorGamut: '100% DCI-P3 Pantone Validated',
    refreshRateHz: 120,
    weightKg: '1.70 kg',
    batteryHours: 10,
    warrantyMonths: 24,
    returnDays: 30,
    highlights: [
      'Màn hình OLED 2.8K 120Hz chuẩn màu điện ảnh 100% DCI-P3',
      'Vi xử lý dòng H hiệu năng cao 12 nhân 16 luồng',
      'Đổi mới miễn phí 30 ngày nếu lỗi phần cứng nhà sản xuất',
      'Bảo hành chính hãng 24 tháng toàn quốc',
    ],
    inStock: true,
    totalAvailableStock: 25,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 15,
        reservedQty: 3,
        availableQty: 12,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 10,
        reservedQty: 2,
        availableQty: 8,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 6,
        reservedQty: 1,
        availableQty: 5,
      },
    ],
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    sku: 'LT-DELL-INSP14-5430',
    name: 'Laptop Dell Inspiron 14 5430',
    brand: 'DELL',
    category: 'Laptop Học tập - Văn phòng',
    useCase: 'OFFICE',
    priceVnd: '18490000',
    originalPriceVnd: '20490000',
    formattedPrice: formatVND('18490000'),
    ramGb: 16,
    ramType: '16GB LPDDR5 4800MHz Dual-Channel',
    storageGb: 512,
    storageType: '512GB M.2 PCIe NVMe SSD',
    cpuModel: 'Intel Core i5-1335U (10 nhân, 12 luồng, 4.6GHz)',
    cpuScore: 79,
    gpuModel: 'Chưa xác nhận',
    gpuScore: 65,
    displaySpec: '14.0" FHD+ (1920x1200) 16:10 WVA Anti-Glare',
    colorGamut: '100% sRGB ComfortView',
    refreshRateHz: 60,
    weightKg: '1.53 kg',
    batteryHours: 11,
    warrantyMonths: 24,
    returnDays: 30,
    highlights: [
      'Khung nhôm nguyên khối Platinum Silver bền bỉ',
      'RAM 16GB LPDDR5 tốc độ 4800MHz tiết kiệm điện',
      'Cảm biến vân tay 1 chạm + cổng Thunderbolt 4',
      'Bảo hành tận nơi ProSupport & Đổi mới 30 ngày',
    ],
    inStock: true,
    totalAvailableStock: 18,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 10,
        reservedQty: 2,
        availableQty: 8,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 7,
        reservedQty: 1,
        availableQty: 6,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 5,
        reservedQty: 1,
        availableQty: 4,
      },
    ],
  },
  {
    id: '50000000-0000-0000-0000-000000000003',
    sku: 'LT-LENOVO-TB14-G6',
    name: 'Laptop Lenovo ThinkBook 14 G6+ (2024)',
    brand: 'LENOVO',
    category: 'Laptop Đồ họa - Kỹ thuật',
    useCase: 'CREATOR',
    priceVnd: '19990000',
    originalPriceVnd: '22490000',
    formattedPrice: formatVND('19990000'),
    ramGb: 16,
    ramType: '16GB LPDDR5X 7467MHz Siêu tốc',
    storageGb: 512,
    storageType: '512GB PCIe 4.0x4 NVMe SSD (2 khe M.2)',
    cpuModel: 'Intel Core Ultra 5 125H (14 nhân, 18 luồng + AI NPU)',
    cpuScore: 93,
    gpuModel: 'Intel Arc Graphics (7-Cores Ray Tracing)',
    gpuScore: 84,
    displaySpec: '14.5" 2.5K (2560x1600) IPS 90Hz, 350 nits',
    colorGamut: '100% sRGB Hardware Low Blue Light',
    refreshRateHz: 90,
    weightKg: '1.50 kg',
    batteryHours: 14,
    warrantyMonths: 24,
    returnDays: 30,
    highlights: [
      'Chip Intel Core Ultra 5 125H tích hợp nhân AI NPU chuyên dụng',
      'Đồ họa Intel Arc mạnh gấp đôi thế hệ cũ, dựng video 4K mượt',
      'Đạt chuẩn độ bền quân đội Mỹ MIL-STD-810H',
      'Pin lớn 85Wh dùng thực tế lên đến 14 giờ',
    ],
    inStock: true,
    totalAvailableStock: 14,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 9,
        reservedQty: 2,
        availableQty: 7,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 6,
        reservedQty: 1,
        availableQty: 5,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 3,
        reservedQty: 1,
        availableQty: 2,
      },
    ],
  },
  {
    id: '50000000-0000-0000-0000-000000000004',
    sku: 'LT-ACER-SWIFT-GO14',
    name: 'Laptop Acer Swift Go 14 OLED SFG14',
    brand: 'ACER',
    category: 'Laptop Học tập - Văn phòng',
    useCase: 'OFFICE',
    priceVnd: '16990000',
    originalPriceVnd: '18990000',
    formattedPrice: formatVND('16990000'),
    ramGb: 16,
    ramType: '16GB LPDDR5 6400MHz',
    storageGb: 512,
    storageType: '512GB PCIe Gen 4 NVMe SSD',
    cpuModel: 'Intel Core i5-13500H (12 nhân, 16 luồng)',
    cpuScore: 85,
    gpuModel: 'Chưa xác nhận',
    gpuScore: 67,
    displaySpec: '14.0" 2.8K (2880x1800) OLED 90Hz, 1ms',
    colorGamut: '100% DCI-P3 TrueBlack 500',
    refreshRateHz: 90,
    weightKg: '1.25 kg',
    batteryHours: 11,
    warrantyMonths: 24,
    returnDays: 30,
    highlights: [
      'Trọng lượng siêu nhẹ chỉ 1.25 kg tiện di chuyển',
      'Màn hình OLED 2.8K 90Hz sắc nét tuyệt đối',
      'Webcam QHD 1440p khử nhiễu AI Acer PurifiedView',
      'Giá tốt nhất phân khúc Laptop OLED 16GB RAM',
    ],
    inStock: true,
    totalAvailableStock: 9,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 5,
        reservedQty: 1,
        availableQty: 4,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 4,
        reservedQty: 1,
        availableQty: 3,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 3,
        reservedQty: 1,
        availableQty: 2,
      },
    ],
  },
  {
    id: '50000000-0000-0000-0000-000000000005',
    sku: 'LT-HP-PAV14-DV2075TU',
    name: 'Laptop HP Pavilion 14-dv2075TU',
    brand: 'HP',
    category: 'Laptop Học tập - Văn phòng',
    useCase: 'OFFICE',
    priceVnd: '15490000',
    originalPriceVnd: '17490000',
    formattedPrice: formatVND('15490000'),
    ramGb: 16,
    ramType: '16GB DDR4 3200MHz',
    storageGb: 512,
    storageType: '512GB PCIe NVMe M.2 SSD',
    cpuModel: 'Intel Core i5-1235U (10 nhân, 12 luồng)',
    cpuScore: 78,
    gpuModel: 'Chưa xác nhận',
    gpuScore: 64,
    displaySpec: '14.0" FHD (1920x1080) IPS BrightView 250 nits',
    colorGamut: '45% NTSC',
    refreshRateHz: 60,
    weightKg: '1.41 kg',
    batteryHours: 9,
    warrantyMonths: 12,
    returnDays: 30,
    highlights: [
      'Thiết kế nắp nhôm mạ vàng sang trọng, mỏng nhẹ 1.41 kg',
      'Hệ thống âm thanh B&O cao cấp, âm lượng lớn',
      'Bảo hành chính hãng HP 12 tháng tận nơi',
    ],
    inStock: true,
    totalAvailableStock: 12,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 6,
        reservedQty: 1,
        availableQty: 5,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 5,
        reservedQty: 1,
        availableQty: 4,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 4,
        reservedQty: 1,
        availableQty: 3,
      },
    ],
  },
  {
    id: '50000000-0000-0000-0000-000000000006',
    sku: 'LT-APPLE-MBA-M2-8GB',
    name: 'MacBook Air 13.6 inch M2 (2022)',
    brand: 'APPLE',
    category: 'Laptop Mỏng nhẹ cao cấp',
    useCase: 'PREMIUM',
    priceVnd: '24990000',
    originalPriceVnd: '27990000',
    formattedPrice: formatVND('24990000'),
    ramGb: 8,
    ramType: '8GB Unified Memory băng thông 100GB/s',
    storageGb: 256,
    storageType: '256GB Apple SSD siêu tốc',
    cpuModel: 'Apple M2 (8-Core CPU, 16-Core Neural Engine)',
    cpuScore: 91,
    gpuModel: 'Apple M2 8-Core GPU',
    gpuScore: 84,
    displaySpec: '13.6" Liquid Retina (2560x1664) 500 nits True Tone',
    colorGamut: 'Wide Color P3',
    refreshRateHz: 60,
    weightKg: '1.24 kg',
    batteryHours: 18,
    warrantyMonths: 12,
    returnDays: 30,
    highlights: [
      'Pin lên tới 18 giờ làm việc liên tục không cần sạc',
      'Chip Apple M2 kiến trúc ARM tiết kiệm điện đỉnh cao',
      'Thiết kế nhôm nguyên khối không quạt tản nhiệt êm tuyệt đối',
      'Bảo hành chính hãng Apple Việt Nam & Đổi mới 30 ngày MWG',
    ],
    inStock: true,
    totalAvailableStock: 11,
    branches: [
      {
        storeId: '10000000-0000-0000-0000-000000000001',
        branchCode: 'MWG_HCM_001',
        name: 'Thế Giới Di Động 136 Nguyễn Thái Học, Quận 1, TP.HCM',
        city: 'HCM',
        physicalQty: 7,
        reservedQty: 1,
        availableQty: 6,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000002',
        branchCode: 'MWG_HN_002',
        name: 'Thế Giới Di Động 117 Thái Hà, Đống Đa, Hà Nội',
        city: 'HN',
        physicalQty: 4,
        reservedQty: 1,
        availableQty: 3,
      },
      {
        storeId: '10000000-0000-0000-0000-000000000003',
        branchCode: 'MWG_DN_003',
        name: 'Điện Máy Xanh 320 đường 2 Tháng 9, Hải Châu, Đà Nẵng',
        city: 'DN',
        physicalQty: 2,
        reservedQty: 0,
        availableQty: 2,
      },
    ],
  },
];

export function mapDtoToLaptopProduct(dto: any, branches?: BranchStockItem[]): LaptopProduct {
  const priceVnd = String(dto.priceVnd ?? dto.price_vnd ?? '');
  if (typeof dto.sku !== 'string' || !dto.sku.trim() || typeof dto.name !== 'string' || !dto.name.trim() || !/^\d+$/.test(priceVnd)) {
    throw new Error('Dữ liệu sản phẩm chưa được xác nhận.');
  }
  const ramGb = Number(dto.ramGb || dto.ram_gb) || 0;
  const storageGb = Number(dto.storageGb || dto.storage_gb) || 0;
  const brand = String(dto.brand || 'Laptop').toUpperCase();
  const name = dto.name || 'Laptop Chính Hãng';
  const sku = dto.sku || '';

  let useCase: LaptopProduct['useCase'] = 'OFFICE';
  const nameLower = name.toLowerCase();
  const gpuLower = String(dto.gpuModel || dto.gpu_model || '').toLowerCase();
  if (gpuLower.includes('rtx') || nameLower.includes('gaming') || nameLower.includes('rog')) {
    useCase = 'GAMING';
  } else if (brand === 'APPLE' || nameLower.includes('macbook') || nameLower.includes('zenbook')) {
    useCase = 'PREMIUM';
  } else if (nameLower.includes('thinkbook') || nameLower.includes('creator') || gpuLower.includes('arc')) {
    useCase = 'CREATOR';
  }

  const cpuScore = dto.cpuScore ?? 0;
  const gpuScore = dto.gpuScore ?? 0;

  const actualBranches = branches || [];
  const totalStock = actualBranches.reduce((sum, b) => sum + b.availableQty, 0);

  return {
    id: dto.id || sku,
    sku,
    name,
    brand,
    category: dto.category || 'Laptop Học tập - Văn phòng',
    useCase,
    priceVnd,
    originalPriceVnd:
      dto.originalPriceVnd ||
      priceVnd,
    formattedPrice: dto.formattedPrice || formatVND(priceVnd),
    ramGb,
    ramType: dto.ramType || (ramGb ? `${ramGb}GB` : 'Chưa xác nhận'),
    storageGb,
    storageType: dto.storageType || (storageGb ? `${storageGb}GB` : 'Chưa xác nhận'),
    cpuModel: dto.cpuModel || dto.cpu_model || 'Chưa xác nhận',
    cpuScore,
    gpuModel: dto.gpuModel || dto.gpu_model || 'Chưa xác nhận',
    gpuScore,
    displaySpec: dto.displaySpec || 'Chưa xác nhận',
    colorGamut: dto.colorGamut || 'Chưa xác nhận',
    refreshRateHz: dto.refreshRateHz || 0,
    weightKg: dto.weightKg || 'Chưa xác nhận',
    batteryHours: dto.batteryHours || 0,
    warrantyMonths: dto.warrantyMonths || 0,
    returnDays: dto.returnDays || 0,
    highlights: Array.isArray(dto.highlights) ? dto.highlights : [],
    inStock: dto.inStock !== false && totalStock > 0,
    totalAvailableStock: totalStock,
    branches: actualBranches,
  };
}

export function filterCatalogItems(
  items: LaptopProduct[],
  params: CatalogFilterParams = {}
): LaptopProduct[] {
  return items.filter((item) => {
    if (params.brand && params.brand !== 'ALL' && item.brand.toUpperCase() !== params.brand.toUpperCase()) {
      return false;
    }
    if (params.useCase && params.useCase !== 'ALL' && item.useCase !== params.useCase) {
      return false;
    }
    if (params.minRam && item.ramGb < params.minRam) {
      return false;
    }
    if (params.maxPrice) {
      const maxP = parseVndBigInt(params.maxPrice);
      if (maxP > BigInt(0) && parseVndBigInt(item.priceVnd) > maxP) return false;
    }
    if (params.minPrice) {
      const minP = parseVndBigInt(params.minPrice);
      if (minP > BigInt(0) && parseVndBigInt(item.priceVnd) < minP) return false;
    }
    if (params.onlyInStock && item.totalAvailableStock <= 0) {
      return false;
    }
    if (params.search && params.search.trim()) {
      const q = params.search.toLowerCase().trim();
      const hay = `${item.name} ${item.sku} ${item.brand} ${item.cpuModel} ${item.gpuModel} ${item.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Data Query (`catalog.get.ts` per 17-FRONTEND_DESIGN.md Section 5.1)
 * Queries directly from NestJS Core API / PostgreSQL 16+ SSOT.
 */
export async function getLaptopCatalog(params: CatalogFilterParams = {}): Promise<LaptopProduct[]> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.brand && params.brand !== 'ALL') query.set('brand', params.brand);
  if (params.maxPrice) query.set('maxPrice', params.maxPrice);
  if (params.minPrice) query.set('minPrice', params.minPrice);
  if (params.minRam) query.set('minRam', String(params.minRam));

  try {
    const res = await apiFetch<any>(`catalog/products?${query.toString()}`, {
      method: 'GET',
      retries: 1,
    });

    if (res.success && res.data) {
      const rawItems = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.items)
        ? res.data.items
        : Array.isArray((res.data as any).data)
        ? (res.data as any).data
        : [];

      if (Array.isArray(rawItems)) {
        const mapped = rawItems.map((it: any) => mapDtoToLaptopProduct(it));
        return filterCatalogItems(mapped, params);
      }
    }
  } catch {
    // Falls through to baseline fallback
  }

  throw new Error('Danh mục sản phẩm hiện không khả dụng.');
}

export async function getLaptopBySku(sku: string): Promise<LaptopProduct | null> {
  const normalized = decodeURIComponent(sku).toUpperCase().trim();
  try {
    const res = await apiFetch<any>(`catalog/products/${normalized}`, {
      method: 'GET',
      retries: 1,
    });

    if (res.success && res.data && (res.data.sku || res.data.id)) {
      if (res.data.sku?.toUpperCase() !== normalized && res.data.id?.toUpperCase() !== normalized) return null;
      const locations = await apiFetch<any[]>('inventory/stores', { retries: 0 });
      const branches: BranchStockItem[] = [];
      if (locations.success && Array.isArray(locations.data)) {
        const stocks = await Promise.all(locations.data.map(async location => {
          const stock = await apiFetch<any>(`inventory/stock?storeId=${encodeURIComponent(location.id)}&variantId=${encodeURIComponent(res.data.id || normalized)}`, { retries: 0 });
          if (!stock.success || !stock.data || !Number.isSafeInteger(stock.data.availableQty)) return null;
          return { storeId: location.id, branchCode: location.code, name: location.name,
            city: (location.code?.includes('_HN_') ? 'HN' : location.code?.includes('_DN_') ? 'DN' : 'HCM') as 'HCM' | 'HN' | 'DN', physicalQty: stock.data.onHandQty, reservedQty: stock.data.reservedQty,
            availableQty: stock.data.availableQty };
        }));
        for (const stock of stocks) if (stock) branches.push(stock);
      }
      return mapDtoToLaptopProduct(res.data, branches);
    }
  } catch {
    // Falls through to baseline fallback
  }

  return null;
}

export async function getLaptopComparison(skus: string[]): Promise<LaptopProduct[]> {
  const cleanSkus = skus.filter(Boolean).map((s) => s.trim().toUpperCase());
  if (cleanSkus.length === 0) return [];

  try {
    const res = await apiFetch<any>(`catalog/compare?skus=${cleanSkus.join(',')}`, {
      method: 'GET',
      retries: 1,
    });

    if (res.success && res.data) {
      const items = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data.items)
        ? res.data.items
        : [];
      if (Array.isArray(items)) {
        return items.map((it: any) => mapDtoToLaptopProduct(it));
      }
    }
  } catch {
    // Falls through to baseline fallback
  }

  throw new Error('Không thể xác nhận dữ liệu so sánh sản phẩm.');
}
