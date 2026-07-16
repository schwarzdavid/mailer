import { Logger } from '@nestjs/common'
import { getModelToken } from '@nestjs/sequelize'
import { Test, TestingModule } from '@nestjs/testing'
import { Op } from 'sequelize'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { ProjectPurgeService } from './project-purge.service'
import { ProjectModel } from '../models/project.model'
import { PROJECT_PURGE_AFTER_MS } from '../project.constants'

describe('ProjectPurgeService', () => {
    let service: ProjectPurgeService
    let projectDestroy: Mock<(options: { where: object; force: boolean }) => Promise<number>>

    beforeEach(async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-07-16T12:00:00.000Z'))
        vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

        projectDestroy = vi.fn<typeof projectDestroy>().mockResolvedValue(0)

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProjectPurgeService,
                { provide: getModelToken(ProjectModel), useValue: { destroy: projectDestroy } },
            ],
        }).compile()

        service = module.get(ProjectPurgeService)
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('hard-deletes projects trashed longer than the retention window', async () => {
        projectDestroy.mockResolvedValue(2)

        await service.purgeExpiredProjects()

        expect(projectDestroy).toHaveBeenCalledWith({
            where: { deletedAt: { [Op.lte]: new Date(Date.now() - PROJECT_PURGE_AFTER_MS) } },
            force: true,
        })
    })

    it('logs and swallows errors from the interval handler', async () => {
        projectDestroy.mockRejectedValue(new Error('database gone'))
        const errorSpy = vi.spyOn(Logger.prototype, 'error')

        await expect(service.handlePurgeInterval()).resolves.toBeUndefined()

        expect(errorSpy).toHaveBeenCalledWith('Project purge failed: database gone')
    })
})
