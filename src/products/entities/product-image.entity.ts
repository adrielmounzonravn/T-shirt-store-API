export class ProductImageEntity {
  id: string;
  productId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;

  constructor(partial: Partial<ProductImageEntity>) {
    Object.assign(this, partial);
  }
}
