import { Expose, Type } from 'class-transformer'
import { DeletedProject, Project, ProjectWithCounts, ProjectWithDomains } from '../interfaces/project.interface'
import { PROJECT_PURGE_AFTER_MS } from '../project.constants'
import { DomainDto } from '../../domain/dtos/domain.dto'
import { DomainDnsDto } from '../../domain/dtos/domain-dns.dto'

export class ProjectDto {
    @Expose()
    projectId!: number

    @Expose()
    name!: string

    @Expose()
    createdAt!: Date

    @Expose()
    updatedAt!: Date

    static fromProject(project: Project): ProjectDto {
        return {
            projectId: project.projectId,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
        }
    }
}

export class ProjectListDto extends ProjectDto {
    @Expose()
    inboundFormCount!: number

    @Expose()
    domainCount!: number

    static fromProjectWithCounts(project: ProjectWithCounts): ProjectListDto {
        return {
            ...ProjectDto.fromProject(project),
            inboundFormCount: project.inboundFormCount,
            domainCount: project.domainCount,
        }
    }
}

export class ProjectDetailDto extends ProjectDto {
    @Expose()
    @Type(() => DomainDto)
    domains!: DomainDto[]

    static fromProjectWithDomains(project: ProjectWithDomains): ProjectDetailDto {
        return {
            ...ProjectDto.fromProject(project),
            domains: project.domains.map((domain) => ({
                ...domain,
                dns: DomainDnsDto.fromArray(domain.dnsRecords),
            })),
        }
    }
}

export class DeletedProjectDto extends ProjectDto {
    @Expose()
    deletedAt!: Date

    @Expose()
    purgeAt!: Date

    static fromDeletedProject(project: DeletedProject): DeletedProjectDto {
        return {
            ...ProjectDto.fromProject(project),
            deletedAt: project.deletedAt,
            purgeAt: new Date(project.deletedAt.getTime() + PROJECT_PURGE_AFTER_MS),
        }
    }
}
