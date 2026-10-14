import { ArgumentsHost, Catch, ConflictException, HttpException, NotFoundException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { EmptyResultError, UniqueConstraintError } from 'sequelize'

@Catch(EmptyResultError, UniqueConstraintError)
export class SequelizeExceptionFilter extends BaseExceptionFilter {
    override catch(exception: EmptyResultError | UniqueConstraintError, host: ArgumentsHost): void {
        super.catch(SequelizeExceptionFilter.toHttpException(exception), host)
    }

    static toHttpException(exception: EmptyResultError | UniqueConstraintError): HttpException {
        if (exception instanceof UniqueConstraintError) {
            return new ConflictException('Resource already exists')
        }

        return new NotFoundException('Resource not found')
    }
}
