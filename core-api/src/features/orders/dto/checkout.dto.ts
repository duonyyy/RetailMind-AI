import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckoutItemDto {
  @IsString({ message: 'Mã SKU phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Mã SKU không được để trống.' })
  @MaxLength(100, { message: 'Mã SKU không được vượt quá 100 ký tự.' })
  sku!: string;

  @Type(() => Number)
  @IsInt({ message: 'Số lượng phải là số nguyên.' })
  @Min(1, { message: 'Số lượng tối thiểu là 1.' })
  @Max(20, { message: 'Số lượng tối đa cho mỗi mặt hàng là 20.' })
  quantity!: number;
}

export class CheckoutDto {
  @IsOptional()
  @IsBoolean()
  fromCart?: boolean;
  @IsUUID('4', { message: 'Mã chi nhánh siêu thị (storeId) phải là định dạng UUIDv4 hợp lệ.' })
  storeId!: string;

  @IsArray({ message: 'Danh sách mặt hàng phải là một mảng.' })
  @ArrayMinSize(1, { message: 'Giỏ hàng phải có ít nhất 1 sản phẩm.' })
  @ArrayMaxSize(50, { message: 'Đơn hàng không được vượt quá 50 loại sản phẩm.' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsString({ message: 'Mã giảm giá phải là chuỗi ký tự.' })
  @MaxLength(32, { message: 'Mã giảm giá không quá 32 ký tự.' })
  discountCode?: string;

  @IsOptional()
  @IsString({ message: 'Mã xác thực Preview Token phải là chuỗi.' })
  previewToken?: string;

  @IsOptional()
  @IsString({ message: 'Phương thức thanh toán phải là chuỗi.' })
  paymentMethod?: string;

  /**
   * Danh tính khách hàng được Controller gán từ JWT `@CurrentUser()`, không nhận từ client
   */
  customerId?: string;
}

export class PreviewOrderDto {
  @IsUUID('4', { message: 'Mã chi nhánh siêu thị (storeId) phải là định dạng UUIDv4 hợp lệ.' })
  storeId!: string;

  @IsArray({ message: 'Danh sách mặt hàng phải là một mảng.' })
  @ArrayMinSize(1, { message: 'Danh sách mặt hàng phải có ít nhất 1 sản phẩm.' })
  @ArrayMaxSize(50, { message: 'Danh sách mặt hàng không vượt quá 50 loại sản phẩm.' })
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @IsString({ message: 'Mã giảm giá phải là chuỗi ký tự.' })
  @MaxLength(32, { message: 'Mã giảm giá không quá 32 ký tự.' })
  discountCode?: string;
}

