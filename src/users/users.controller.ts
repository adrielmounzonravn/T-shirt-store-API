import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PoliciesGuard } from '../casl/guards/policies.guard.js';
import { CheckPolicies } from '../casl/decorators/check-policies.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CreateDeliveryPersonDto } from './dto/create-delivery-person.dto.js';
import { UserEntity } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth('bearerAuth')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, PoliciesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.manager)
  @CheckPolicies((ability) => ability.can('create', 'User'))
  @ApiOperation({
    summary: 'Create a delivery-person account (Manager)',
    description:
      'The only way to create a user with a role other than client — ' +
      'signup always creates a client. role must be deliveryPerson.',
  })
  @ApiResponse({
    status: 201,
    description: 'Delivery-person account created',
    type: UserEntity,
  })
  @ApiErrorResponses(400, 401, 403, 409)
  create(@Body() dto: CreateDeliveryPersonDto): Promise<UserEntity> {
    return this.usersService.create({ ...dto, isVerified: true });
  }
}
