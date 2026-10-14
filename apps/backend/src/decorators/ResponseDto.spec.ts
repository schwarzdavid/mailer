import 'reflect-metadata'
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants.js'
import { describe, expect, it } from 'vitest'
import { ResponseDto } from './ResponseDto.js'

class PayloadDto {
    id!: number
}

class Controller {
    @ResponseDto(PayloadDto)
    handler(this: void) {}
}

describe('ResponseDto', () => {
    it('serializes the handler response through the given DTO', () => {
        expect(Reflect.getMetadata(CLASS_SERIALIZER_OPTIONS, Controller.prototype.handler)).toEqual({
            type: PayloadDto,
        })
    })

    it('documents the DTO as the 200 response in the OpenAPI spec', () => {
        const responses = Reflect.getMetadata('swagger/apiResponse', Controller.prototype.handler) as Record<
            string,
            { type?: unknown }
        >

        expect(responses['200']).toMatchObject({ type: PayloadDto })
    })
})
