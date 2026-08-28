import { Equals } from 'class-validator';

export class SetCoverImageDto {
  @Equals(true)
  isCover: true;
}
