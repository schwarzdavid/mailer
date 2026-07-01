import { Injectable } from '@nestjs/common';
import { DomainDto } from '../dtos/domain.dto';
import { DomainDkim, DomainDkimAlgorithm, DomainDkimKeyBits } from '../interfaces/domain-dkim.interface';
import { InjectModel } from '@nestjs/sequelize';
import { DomainDkimModel } from '../models/domain-dkim.model';
import { generateKeyPair } from 'node:crypto';
import { DkimEncryptionService } from './dkim-encryption.service';
import { Sequelize } from 'sequelize-typescript';
import { DomainModel } from '../models/domain.model';

interface KeyPair {
    privateKey: string;
    publicKey: string;
}

@Injectable()
export class DomainDkimService {
    private static readonly DEFAULT_SELECTOR = 's1';

    constructor(
        private readonly dkimEncryptionService: DkimEncryptionService,
        private readonly sequelize: Sequelize,
        @InjectModel(DomainDkimModel) private readonly domainDkimModel: typeof DomainDkimModel,
        @InjectModel(DomainModel) private readonly domainModel: typeof DomainModel
    ) {}

    async createDkimForDomain(domain: DomainDto, setActive = false): Promise<DomainDkim> {
        const { privateKey, publicKey } = await this.generateDkimKeyPair();
        const encryptedPrivateKey = await this.dkimEncryptionService.encryptDkimPrivateKey(privateKey);

        const transaction = setActive ? await this.sequelize.transaction() : null

        const dkimModel = await this.domainDkimModel.create({
            domainId: domain.domainId,
            privateKey: encryptedPrivateKey,
            publicKey: publicKey,
            algorithm: DomainDkimAlgorithm.RSA,
            keyBits: 2048,
            selector: DomainDkimService.DEFAULT_SELECTOR
        }, {returning: true, transaction});

        if(setActive) {
            await this.domainModel.update({
                activeDkimId: dkimModel.dkimId
            }, {
                where: {
                    domainId: domain.domainId
                },
                transaction
            })
        }

        return dkimModel.get({plain: true});
    }

    private generateDkimKeyPair(): Promise<KeyPair> {
        return new Promise((resolve, reject) => {
            generateKeyPair(
                DomainDkimAlgorithm.RSA,
                {
                    modulusLength: 2048 satisfies DomainDkimKeyBits,
                    publicKeyEncoding: {
                        type: 'spki',
                        format: 'pem',
                    },
                    privateKeyEncoding: {
                        type: 'pkcs8',
                        format: 'pem',
                    },
                },
                (err, publicKey, privateKey) => {
                    if (err) {
                        return reject(err);
                    }
                    resolve({ privateKey, publicKey });
                },
            );
        });
    }
}
