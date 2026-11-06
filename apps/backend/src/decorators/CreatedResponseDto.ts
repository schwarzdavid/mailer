import { applyDecorators, SerializeOptions, Type } from '@nestjs/common'
import { ApiCreatedResponse } from '@nestjs/swagger'

export const CreatedResponseDto = (type: Type) =>
    applyDecorators(SerializeOptions({ type }), ApiCreatedResponse({ type }))
