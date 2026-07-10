import { registerDecorator, ValidationOptions } from 'class-validator'
import { parse } from 'tldts'

export function IsIcann(options?: ValidationOptions) {
    return (object: object, propertyName: string) =>
        registerDecorator({
            name: 'isIcann',
            target: object.constructor,
            propertyName,
            constraints: [],
            options,
            validator: {
                validate(value: string) {
                    const { isIcann } = parse(value)
                    return !!isIcann
                },
                defaultMessage() {
                    return 'The domain must be a valid ICANN domain.'
                },
            },
        })
}
