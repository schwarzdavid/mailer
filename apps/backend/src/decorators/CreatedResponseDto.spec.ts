import 'reflect-metadata'
import { CLASS_SERIALIZER_OPTIONS } from '@nestjs/common/serializer/class-serializer.constants.js'
import { describe, expect, it } from 'vitest'
import { CreatedResponseDto } from './CreatedResponseDto.js'

class PayloadDto {
    id!: number
}

class Controller {
    @CreatedResponseDto(PayloadDto)
    handler(this: void) {}
}

describe('CreatedResponseDto', () => {
    it('serializes the handler response through the given DTO', () => {
        expect(Reflect.getMetadata(CLASS_SERIALIZER_OPTIONS, Controller.prototype.handler)).toEqual({
            type: PayloadDto,
        })
    })

    it('documents the DTO as the only 201 response in the OpenAPI spec', () => {
        const responses = Reflect.getMetadata('swagger/apiResponse', Controller.prototype.handler) as Record<
            string,
            { type?: unknown }
        >

        expect(Object.keys(responses)).toEqual(['201'])
        expect(responses['201']).toMatchObject({ type: PayloadDto })
    })
})
