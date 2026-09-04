import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller('checkout')
export class CheckoutRedirectController {
  @Get('success')
  success(): { message: string } {
    return {
      message: 'Payment completed. You can close this page.',
    };
  }

  @Get('cancel')
  cancel(): { message: string } {
    return {
      message: 'Payment was cancelled. You can close this page.',
    };
  }
}
