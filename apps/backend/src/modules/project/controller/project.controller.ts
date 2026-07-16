import { Body, Controller, Delete, Get, Param, Patch, Post, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { ProjectService } from '../services/project.service'
import { ProjectCreateDto, ProjectUpdateDto } from '../dtos/project-create.dto'
import { ProjectDomainAssignDto } from '../dtos/project-domain-assign.dto'
import { DeletedProjectDto, ProjectDetailDto, ProjectDto, ProjectListDto } from '../dtos/project.dto'

@JwtAuth()
@ApiTags('project')
@Controller('project')
export class ProjectController {
    constructor(private readonly projectService: ProjectService) {}

    @ResponseDto(ProjectDto)
    @Post()
    async createProject(@Body() body: ProjectCreateDto): Promise<ProjectDto> {
        const project = await this.projectService.createProject(body.name)

        return ProjectDto.fromProject(project)
    }

    @SerializeOptions({ type: ProjectListDto })
    @Get()
    async getProjects(): Promise<ProjectListDto[]> {
        const projects = await this.projectService.getProjects()

        return projects.map((project) => ProjectListDto.fromProjectWithCounts(project))
    }

    @SerializeOptions({ type: DeletedProjectDto })
    @Get('deleted')
    async getDeletedProjects(): Promise<DeletedProjectDto[]> {
        const projects = await this.projectService.getDeletedProjects()

        return projects.map((project) => DeletedProjectDto.fromDeletedProject(project))
    }

    @ResponseDto(ProjectDetailDto)
    @Get(':projectId')
    async getProject(@Param('projectId') projectId: number): Promise<ProjectDetailDto> {
        const project = await this.projectService.getProjectById(projectId)

        return ProjectDetailDto.fromProjectWithDomains(project)
    }

    @ResponseDto(ProjectDto)
    @Patch(':projectId')
    async updateProject(@Param('projectId') projectId: number, @Body() body: ProjectUpdateDto): Promise<ProjectDto> {
        const project = await this.projectService.updateProject(projectId, { name: body.name })

        return ProjectDto.fromProject(project)
    }

    @Delete(':projectId')
    async deleteProject(@Param('projectId') projectId: number): Promise<void> {
        await this.projectService.deleteProject(projectId)
    }

    @ResponseDto(ProjectDto)
    @Post(':projectId/restore')
    async restoreProject(@Param('projectId') projectId: number): Promise<ProjectDto> {
        const project = await this.projectService.restoreProject(projectId)

        return ProjectDto.fromProject(project)
    }

    @Post(':projectId/domains')
    async assignProjectDomain(
        @Param('projectId') projectId: number,
        @Body() body: ProjectDomainAssignDto,
    ): Promise<void> {
        await this.projectService.assignDomain(projectId, body.domainId)
    }

    @Delete(':projectId/domains/:domainId')
    async unassignProjectDomain(
        @Param('projectId') projectId: number,
        @Param('domainId') domainId: number,
    ): Promise<void> {
        await this.projectService.unassignDomain(projectId, domainId)
    }
}
