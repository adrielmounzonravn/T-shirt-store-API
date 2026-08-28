import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'ErrorResponse' })
export class ErrorResponseEntity {
  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  message: string;

  @ApiProperty()
  error: string;
}
