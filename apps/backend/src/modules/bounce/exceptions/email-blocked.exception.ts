export class EmailBlockedException extends Error {
    constructor(
        readonly emailAddress: string,
        readonly blockedUntil: Date,
    ) {
        super(`Recipient ${emailAddress} is blocked until ${blockedUntil.toISOString()}`)
        this.name = 'EmailBlockedException'
    }
}
