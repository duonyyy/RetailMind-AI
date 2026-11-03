import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class AddToCartDTO {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  storeId?: string;
}

export class UpdateCartItemDTO {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  storeId?: string;
}

export interface CartItemDTO {
  id: string;
  sku: string;
  name: string;
  variantId: string;
  unitPriceVnd: string;
  formattedUnitPrice: string;
  quantity: number;
  lineTotalVnd: string;
  formattedLineTotal: string;
  availableStock: number | null;
  inStock: boolean | null;
}

export interface CartDTO {
  storeId: string | null;
  id: string;
  customerId: string;
  status: string;
  items: CartItemDTO[];
  itemsCount: number;
  subtotalVnd: string;
  vatVnd: string;
  totalVnd: string;
  formattedTotal: string;
  updatedAt: string;
}

