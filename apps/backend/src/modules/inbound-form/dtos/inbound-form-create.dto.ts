import { Expose } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class InboundFormCreateDto {
    @Expose()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name!: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true, required: false })
    @IsOptional()
    @IsInt()
    domainId: number | null = null

    @Expose()
    @IsInt()
    projectId!: number
}

export class InboundFormUpdateDto {
    @Expose()
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name?: string

    @Expose()
    @ApiProperty({ type: Number, nullable: true, required: false })
    @IsOptional()
    @IsInt()
    domainId?: number | null

    @Expose()
    @ApiProperty({ type: Boolean, required: false })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean

    @Expose()
    @ApiProperty({ type: [String], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @ArrayMaxSize(50)
    allowedHostnames?: string[]
}
