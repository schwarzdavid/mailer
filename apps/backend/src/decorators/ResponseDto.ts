import { applyDecorators, SerializeOptions } from '@nestjs/common'
import { Type } from '@nestjs/common/interfaces'
import { ApiOkResponse } from '@nestjs/swagger'

export const ResponseDto = (type: Type) => applyDecorators(SerializeOptions({ type }), ApiOkResponse({ type }))
