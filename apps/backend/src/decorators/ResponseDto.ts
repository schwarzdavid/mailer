import { applyDecorators, SerializeOptions, Type } from '@nestjs/common'
import { ApiOkResponse } from '@nestjs/swagger'

export const ResponseDto = (type: Type) => applyDecorators(SerializeOptions({ type }), ApiOkResponse({ type }))
