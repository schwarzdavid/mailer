import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/sequelize'
import { Interval } from '@nestjs/schedule'
import { Op } from 'sequelize'
import { ProjectModel } from '../models/project.model'
import { PROJECT_PURGE_AFTER_MS, PROJECT_PURGE_INTERVAL_MS } from '../project.constants'

@Injectable()
export class ProjectPurgeService {
    private readonly logger = new Logger(ProjectPurgeService.name)

    constructor(@InjectModel(ProjectModel) private readonly projectModel: typeof ProjectModel) {}

    @Interval(PROJECT_PURGE_INTERVAL_MS)
    async handlePurgeInterval(): Promise<void> {
        try {
            await this.purgeExpiredProjects()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            this.logger.error(`Project purge failed: ${message}`)
        }
    }

    async purgeExpiredProjects(): Promise<void> {
        const cutoff = new Date(Date.now() - PROJECT_PURGE_AFTER_MS)
        const purged = await this.projectModel.destroy({
            where: { deletedAt: { [Op.lte]: cutoff } },
            force: true,
        })

        if (purged > 0) {
            this.logger.log(`Purged ${purged} expired projects`)
        }
    }
}
