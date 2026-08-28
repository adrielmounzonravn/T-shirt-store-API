export class PaginationMetaEntity {
  limit: number;
  offset: number;
  total: number;

  constructor(partial: PaginationMetaEntity) {
    Object.assign(this, partial);
  }
}
