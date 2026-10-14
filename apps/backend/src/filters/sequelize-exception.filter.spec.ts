import { ConflictException, NotFoundException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host.js'
import { EmptyResultError, UniqueConstraintError } from 'sequelize'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SequelizeExceptionFilter } from './sequelize-exception.filter.js'

describe('SequelizeExceptionFilter', () => {
    const host = new ExecutionContextHost([])

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('maps an empty rejectOnEmpty lookup to 404', () => {
        expect(SequelizeExceptionFilter.toHttpException(new EmptyResultError('missing'))).toBeInstanceOf(
            NotFoundException,
        )
    })

    it('maps a unique constraint violation to 409', () => {
        expect(SequelizeExceptionFilter.toHttpException(new UniqueConstraintError({}))).toBeInstanceOf(
            ConflictException,
        )
    })

    it('hands the mapped http exception to the base filter', () => {
        const baseCatch = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined)

        new SequelizeExceptionFilter().catch(new UniqueConstraintError({}), host)

        expect(baseCatch).toHaveBeenCalledWith(expect.any(ConflictException), host)
    })
})
