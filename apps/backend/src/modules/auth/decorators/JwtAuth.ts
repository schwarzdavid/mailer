import { applyDecorators, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { ApiBearerAuth } from '@nestjs/swagger'

export const JwtAuth = () => applyDecorators(UseGuards(JwtAuthGuard), ApiBearerAuth())
