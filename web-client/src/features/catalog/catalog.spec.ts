import {
  mapDtoToLaptopProduct,
  filterCatalogItems,
  BASELINE_LAPTOP_CATALOG,
} from './services/catalog.get';

describe('Catalog Data Adapter & Multi-Faceted Filters (SCR-03)', () => {
  it('should map raw RetailProductDTO from Core API to full LaptopProduct', () => {
    const rawDto = {
      id: '50000000-0000-0000-0000-000000000001',
      sku: 'LT-ASUS-VIVO15-OLED',
      name: 'Laptop Asus Vivobook 15 OLED A1505VA',
      brand: 'ASUS',
      category: 'Laptop Học tập - Văn phòng',
      priceVnd: '17990000',
      ramGb: 16,
      storageGb: 512,
      cpuModel: 'Intel Core i5-13500H',
      gpuModel: 'Intel Iris Xe Graphics',
      inStock: true,
    };

    const product = mapDtoToLaptopProduct(rawDto);

    expect(product.sku).toBe('LT-ASUS-VIVO15-OLED');
    expect(product.brand).toBe('ASUS');
    expect(product.ramGb).toBe(16);
    expect(product.priceVnd).toBe('17990000');
    expect(product.formattedPrice).toContain('17.990.000');
    expect(product.useCase).toBe('OFFICE');
    expect(product.branches).toEqual([]);
    expect(product.totalAvailableStock).toBe(0);
  });

  it('should classify use case correctly based on brand and GPU', () => {
    const gaming = mapDtoToLaptopProduct({
      sku: 'LT-ROG-G16',
      name: 'Asus ROG Strix G16',
      priceVnd: '100',
      brand: 'ASUS',
      gpuModel: 'NVIDIA RTX 4060',
    });
    expect(gaming.useCase).toBe('GAMING');

    const apple = mapDtoToLaptopProduct({
      sku: 'LT-MBA-M2',
      name: 'MacBook Air M2',
      priceVnd: '100',
      brand: 'APPLE',
    });
    expect(apple.useCase).toBe('PREMIUM');

    const creator = mapDtoToLaptopProduct({
      sku: 'LT-TB14',
      name: 'ThinkBook 14 G6',
      priceVnd: '100',
      brand: 'LENOVO',
      gpuModel: 'Intel Arc Graphics',
    });
    expect(creator.useCase).toBe('CREATOR');
  });

  it('should filter items by brand, RAM, and price ceiling', () => {
    const filteredByBrand = filterCatalogItems(BASELINE_LAPTOP_CATALOG, {
      brand: 'ASUS',
    });
    expect(filteredByBrand.length).toBeGreaterThanOrEqual(1);
    expect(filteredByBrand.every((i) => i.brand === 'ASUS')).toBe(true);

    const filteredByRam = filterCatalogItems(BASELINE_LAPTOP_CATALOG, {
      minRam: 16,
    });
    expect(filteredByRam.every((i) => i.ramGb >= 16)).toBe(true);

    const filteredByPrice = filterCatalogItems(BASELINE_LAPTOP_CATALOG, {
      maxPrice: '18000000',
    });
    expect(
      filteredByPrice.every((i) => BigInt(i.priceVnd) <= BigInt(18000000))
    ).toBe(true);
  });
});

