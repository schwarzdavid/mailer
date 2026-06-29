import {Injectable, Logger, OnApplicationBootstrap} from "@nestjs/common";
import {UserService} from "./user/user.service";
import {ConfigService} from "@nestjs/config";
import {InjectModel} from "@nestjs/sequelize";
import {UserModel} from "./user/user.model";
import {randomBytes} from "node:crypto";

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
    private readonly logger = new Logger(BootstrapService.name)

    constructor(
        private readonly userService: UserService,
        private readonly configService: ConfigService,
        @InjectModel(UserModel) private readonly userModel: typeof UserModel
    ) {
    }

    async onApplicationBootstrap() {
        const userCount = await this.userModel.count()

        if(userCount) {
            this.logger.log('Admin User already exists.')
        } else {
            this.logger.log('Admin User does not exist yet. Creating a new one.')
            const email = this.configService.get<string>('ADMIN_EMAIL', 'admin@example.com')
            const password = randomBytes(16).toString('hex')

            await this.userService.createUser({
                firstName: 'Admin',
                lastName: 'Admin',
                email,
                password
            })

            this.logger.log('Admin User created with')
            this.logger.log(`Email: ${email}`)
            this.logger.log(`Password: ${password}`)
        }
    }
}
