import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, SerializeOptions } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuth } from '../../auth/decorators/JwtAuth.js'
import { Principal } from '../../auth/decorators/Principal.js'
import { RequireAbility } from '../../permission/decorators/RequireAbility.js'
import { CurrentAbility } from '../../permission/decorators/CurrentAbility.js'
import { ResponseDto } from '../../../decorators/ResponseDto.js'
import { ProjectService } from '../services/project.service.js'
import { ProjectMemberService } from '../../permission/services/project-member.service.js'
import { ProjectCreateDto, ProjectUpdateDto } from '../dtos/project-create.dto.js'
import { ProjectDomainAssignDto } from '../dtos/project-domain-assign.dto.js'
import {
    ProjectImplicitAccessDto,
    ProjectMemberDto,
    ProjectMemberPutDto,
    ProjectRoleDto,
} from '../dtos/project-member.dto.js'
import { DeletedProjectDto, ProjectDetailDto, ProjectDto, ProjectListDto } from '../dtos/project.dto.js'
import type { UserWithRole } from '../../user/interfaces/user.interface.js'
import type { AppAbility } from '../../permission/interfaces/app-ability.js'

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
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDetailDto> {
        const project = await this.projectService.getProjectById(projectId, ability)

        return ProjectDetailDto.fromProjectWithDomains(project)
    }

    @ResponseDto(ProjectDto)
    @Patch(':projectId')
    async updateProject(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Body() body: ProjectUpdateDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.updateProject(projectId, { name: body.name }, ability)

        return ProjectDto.fromProject(project)
    }

    @Delete(':projectId')
    async deleteProject(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.deleteProject(projectId, ability)
    }

    @ResponseDto(ProjectDto)
    @Post(':projectId/restore')
    async restoreProject(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectDto> {
        const project = await this.projectService.restoreProject(projectId, ability)

        return ProjectDto.fromProject(project)
    }

    @Post(':projectId/domains')
    async assignProjectDomain(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Body() body: ProjectDomainAssignDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.assignDomain(projectId, body.domainId, ability)
    }

    @Delete(':projectId/domains/:domainId')
    async unassignProjectDomain(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('domainId', ParseIntPipe) domainId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectService.unassignDomain(projectId, domainId, ability)
    }

    @SerializeOptions({ type: ProjectMemberDto })
    @Get(':projectId/members')
    async getProjectMembers(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectMemberDto[]> {
        return await this.projectMemberService.getMembers(projectId, ability)
    }

    @ResponseDto(ProjectImplicitAccessDto)
    @Get(':projectId/implicit-access')
    async getProjectImplicitAccess(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectImplicitAccessDto> {
        const access = await this.projectMemberService.getImplicitAccess(projectId, ability)

        return ProjectImplicitAccessDto.fromImplicitAccess(access)
    }

    @SerializeOptions({ type: ProjectRoleDto })
    @Get(':projectId/roles')
    async getProjectRoles(
        @Param('projectId', ParseIntPipe) projectId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<ProjectRoleDto[]> {
        const roles = await this.projectMemberService.getProjectRoles(projectId, ability)

        return roles.map((role) => ProjectRoleDto.fromRole(role))
    }

    @Put(':projectId/members/:userId')
    async setProjectMember(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('userId', ParseIntPipe) userId: number,
        @Body() body: ProjectMemberPutDto,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.setMember(
            projectId,
            userId,
            { roleId: body.roleId, permissions: body.permissions ?? [] },
            ability,
        )
    }

    @Delete(':projectId/members/:userId')
    async removeProjectMember(
        @Param('projectId', ParseIntPipe) projectId: number,
        @Param('userId', ParseIntPipe) userId: number,
        @CurrentAbility() ability: AppAbility,
    ): Promise<void> {
        await this.projectMemberService.removeMember(projectId, userId, ability)
    }
}
