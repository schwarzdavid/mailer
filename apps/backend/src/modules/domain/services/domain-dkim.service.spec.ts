import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/sequelize'
import { Sequelize } from 'sequelize-typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomainDkimService } from './domain-dkim.service'

type GenerateRsaKeyPair = (
    type: 'rsa',
    options: {
        modulusLength: number
        publicKeyEncoding: { type: string; format: string }
        privateKeyEncoding: { type: string; format: string }
    },
    callback: (err: Error | null, publicKey: string, privateKey: string) => void,
) => void

const keygenControl = vi.hoisted(() => ({ fail: false }))

vi.mock('node:crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:crypto')>()
    const realGenerateKeyPair = actual.generateKeyPair as unknown as GenerateRsaKeyPair
    return {
        ...actual,
        generateKeyPair: ((type, options, callback) =>
            keygenControl.fail
                ? callback(new Error('key generation failed'), '', '')
                : realGenerateKeyPair(type, options, callback)) satisfies GenerateRsaKeyPair,
    }
})
import { DkimEncryptionService } from './dkim-encryption.service'
import { DomainDkimModel } from '../models/domain-dkim.model'
import { DomainModel } from '../models/domain.model'
import { DomainDkimAlgorithm } from '../interfaces/domain-dkim.interface'
import { Domain } from '../interfaces/domain.interface'

describe('DomainDkimService', () => {
    let service: DomainDkimService
    let encrypt: ReturnType<typeof vi.fn>
    let transaction: ReturnType<typeof vi.fn>
    let commit: ReturnType<typeof vi.fn>
    let rollback: ReturnType<typeof vi.fn>
    let dkimCreate: ReturnType<typeof vi.fn>
    let domainUpdate: ReturnType<typeof vi.fn>

    // Captured from the create() call so tests can assert on the persisted row.
    let createdAttrs: Record<string, unknown> | undefined
    let createdOptions: { returning?: boolean; transaction?: unknown } | undefined

    // The service only needs the domain's identity to attach the DKIM record.
    const domain: Pick<Domain, 'domainId'> = { domainId: 12 }
    // A stand-in for the Sequelize transaction that records commit/rollback calls.
    let txHandle: { commit: ReturnType<typeof vi.fn>; rollback: ReturnType<typeof vi.fn> }
    const newDkimId = 55

    beforeEach(async () => {
        createdAttrs = undefined
        createdOptions = undefined

        commit = vi.fn().mockResolvedValue(undefined)
        rollback = vi.fn().mockResolvedValue(undefined)
        txHandle = { commit, rollback }

        // Marks its input so tests can prove the stored key is the encrypted output.
        encrypt = vi.fn((pem: string) => Promise.resolve(`encrypted:${pem.length}`))
        transaction = vi.fn().mockResolvedValue(txHandle)
        domainUpdate = vi.fn().mockResolvedValue([1])
        dkimCreate = vi.fn(
            (attrs: Record<string, unknown>, options: { returning?: boolean; transaction?: unknown }) => {
                createdAttrs = attrs
                createdOptions = options
                return {
                    dkimId: newDkimId,
                    get: () => ({ dkimId: newDkimId, ...attrs }),
                }
            },
        )

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DomainDkimService,
                { provide: DkimEncryptionService, useValue: { encryptDkimPrivateKey: encrypt } },
                { provide: Sequelize, useValue: { transaction } },
                { provide: getModelToken(DomainDkimModel), useValue: { create: dkimCreate } },
                { provide: getModelToken(DomainModel), useValue: { update: domainUpdate } },
            ],
        }).compile()

        service = module.get(DomainDkimService)
    })

    afterEach(() => {
        keygenControl.fail = false
    })

    it('persists a DKIM record with the RSA/2048/s1 defaults for the domain', async () => {
        await service.createDkimForDomain(domain)

        expect(dkimCreate).toHaveBeenCalledTimes(1)
        expect(createdAttrs).toMatchObject({
            domainId: 12,
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
            selector: 's1',
        })
    })

    it('generates a real RSA key pair and stores the public key as PEM', async () => {
        await service.createDkimForDomain(domain)

        expect(createdAttrs?.publicKey).toContain('BEGIN PUBLIC KEY')
    })

    it('encrypts the freshly generated private key instead of storing it raw', async () => {
        await service.createDkimForDomain(domain)

        expect(encrypt).toHaveBeenCalledTimes(1)
        // The encryptor receives the raw generated PEM private key...
        expect(encrypt.mock.calls[0]![0]).toContain('BEGIN PRIVATE KEY')
        // ...and only its encrypted output is handed to the model.
        expect(createdAttrs?.privateKey).toBe(await encrypt.mock.results[0]!.value)
        expect(createdAttrs?.privateKey).not.toContain('BEGIN PRIVATE KEY')
    })

    it('neither opens a transaction nor touches the domain when not activating', async () => {
        await service.createDkimForDomain(domain)

        expect(transaction).not.toHaveBeenCalled()
        expect(domainUpdate).not.toHaveBeenCalled()
        expect(commit).not.toHaveBeenCalled()
        expect(rollback).not.toHaveBeenCalled()
        expect(createdOptions).toMatchObject({ returning: true, transaction: null })
    })

    it('opens a transaction and points the domain at the new key when activating', async () => {
        await service.createDkimForDomain(domain, true)

        expect(transaction).toHaveBeenCalledTimes(1)
        // The insert and the domain update share the same transaction.
        expect(createdOptions?.transaction).toBe(txHandle)
        expect(domainUpdate).toHaveBeenCalledWith(
            { activeDkimId: newDkimId },
            { where: { domainId: 12 }, transaction: txHandle },
        )
    })

    it('commits the transaction once the new key has been activated', async () => {
        await service.createDkimForDomain(domain, true)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(rollback).not.toHaveBeenCalled()
    })

    it('rolls back and rethrows when activating the domain fails', async () => {
        const failure = new Error('domain update failed')
        domainUpdate.mockRejectedValue(failure)

        await expect(service.createDkimForDomain(domain, true)).rejects.toBe(failure)

        expect(rollback).toHaveBeenCalledTimes(1)
        expect(commit).not.toHaveBeenCalled()
    })

    it('returns the persisted DKIM record as a plain object', async () => {
        const result = await service.createDkimForDomain(domain)

        expect(result).toMatchObject({
            dkimId: newDkimId,
            domainId: 12,
            selector: 's1',
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
        })
    })

    it('rejects when RSA key generation fails', async () => {
        keygenControl.fail = true

        await expect(service.createDkimForDomain(domain)).rejects.toThrow('key generation failed')
    })
})
