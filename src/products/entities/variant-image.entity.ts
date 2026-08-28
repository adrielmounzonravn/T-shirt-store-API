export class VariantImageEntity {
  id: string;
  skuId: string;
  imagePath: string;
  isCover: boolean;
  createdAt: Date;

  constructor(partial: Partial<VariantImageEntity>) {
    Object.assign(this, partial);
  }
}
