import { Role } from '../generated/prisma/enums.js';

export interface JwtPayload {
  sub: string;
  role: Role;
}
