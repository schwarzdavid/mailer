import { Body, Controller, Delete, Get, Param, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth'
import { Principal } from '../../auth/decorators/Principal'
import { RequireAbility } from '../../permission/decorators/RequireAbility'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility'
import { ResponseDto } from '../../../decorators/ResponseDto'
import { ProjectService } from '../services/project.service'
import { ProjectMemberService } from '../../permission/services/project-member.service'
import { ProjectCreateDto, ProjectUpdateDto } from '../dtos/project-create.dto'
import { ProjectDomainAssignDto } from '../dtos/project-domain-assign.dto'
import { ProjectMemberDto, ProjectMemberPutDto } from '../dtos/project-member.dto'
import { DeletedProjectDto, ProjectDetailDto, ProjectDto, ProjectListDto } from '../dtos/project.dto'
import type { UserWithRole } from '../../user/interfaces/user.interface'
import type { AppAbility } from '../../permission/interfaces/app-ability'

@JwtAuth()
@ApiTags('project')
@Controller('project')
export class ProjectController {
    constructor(
        private readonly projectService: ProjectService,
        private readonly projectMemberService: ProjectMemberService,
    ) {}

    @RequireAbility({ action: 'create', subject: 'Project' })
    @ResponseDto(ProjectDto)
    @Post()
    async createProject(@Body() body: ProjectCreateDto, @Principal() principal: UserWithRole): Promise<ProjectDto> {
        const project = await this.projectService.createProject(body.name, principal)

        return ProjectDto.fromProject(project)
    }

    @SerializeOptions({ type: ProjectListDto })
    @Get()
    async getProjects(@Principal() principal: UserWithRole): Promise<ProjectListDto[]> {
        const projects = await this.projectService.getProjects(principal)

        return projects.map((project) => ProjectListDto.fromProjectWithCounts(project))
    }

    @SerializeOptions({ type: DeletedProjectDto })
    @Get('deleted')
    async getDeletedProjects(@Principal() principal: UserWithRole): Promise<DeletedProjectDto[]> {
        const projects = await this.projectService.getDeletedProjects(principal)

        return projects.map((project) => DeletedProjectDto.fromDeletedProject(project))
    }

    @ResponseDto(ProjectDetailDto)
    @Get(':projectId')
    async getProject(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDetailDto> {
        const project = await this.projectService.getProjectById(projectId, ability)

        return ProjectDetailDto.fromProjectWithDomains(project)
    }

    @ResponseDto(ProjectDto)
    @Patch(':projectId')
    async updateProject(
        @Param('projectId') projectId: number,
        @Body() body: ProjectUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.updateProject(projectId, { name: body.name }, ability)

        return ProjectDto.fromProject(project)
    }

    @Delete(':projectId')
    async deleteProject(@Param('projectId') projectId: number, @CurrentAbility() ability: AppAbility): Promise<void> {
        await this.projectService.deleteProject(projectId, ability)
    }

    @ResponseDto(ProjectDto)
    @Post(':projectId/restore')
    async restoreProject(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.restoreProject(projectId, ability)

        return ProjectDto.fromProject(project)
    }

    @Post(':projectId/domains')
    async assignProjectDomain(
        @Param('projectId') projectId: number,
        @Body() body: ProjectDomainAssignDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.assignDomain(projectId, body.domainId, ability)
    }

    @Delete(':projectId/domains/:domainId')
    async unassignProjectDomain(
        @Param('projectId') projectId: number,
        @Param('domainId') domainId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.unassignDomain(projectId, domainId, ability)
    }

    @SerializeOptions({ type: ProjectMemberDto })
    @Get(':projectId/members')
    async getProjectMembers(
        @Param('projectId') projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectMemberDto[]> {
        return await this.projectMemberService.getMembers(projectId, ability)
    }

    @Put(':projectId/members/:userId')
    async setProjectMember(
        @Param('projectId') projectId: number,
        @Param('userId') userId: number,
        @Body() body: ProjectMemberPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.setMemberPermissions(projectId, userId, body.permissions, ability)
    }

    @Delete(':projectId/members/:userId')
    async removeProjectMember(
        @Param('projectId') projectId: number,
        @Param('userId') userId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.removeMember(projectId, userId, ability)
    }
}
