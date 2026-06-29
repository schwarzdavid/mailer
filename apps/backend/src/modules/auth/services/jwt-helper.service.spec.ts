import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it } from 'vitest';
import { JwtHelperService } from './jwt-helper.service';
import { UserDto } from '../../user/dtos/user.dto';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtHelperService', () => {
  let service: JwtHelperService;
  let jwtService: JwtService;

  const user: UserDto = Object.assign(new UserDto(), {
    userId: 42,
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    // Use a real JwtService so the test exercises actual signing, not a stub.
    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [JwtHelperService],
    }).compile();

    service = module.get(JwtHelperService);
    jwtService = module.get(JwtService);
  });

  it('signs a token that verifies against the configured secret', async () => {
    const token = await service.createToken(user);

    expect(typeof token).toBe('string');
    expect(() => {
      jwtService.verify(token);
    }).not.toThrow();
  });

  it('maps the user onto the expected JWT claims', async () => {
    const token = await service.createToken(user);
    const payload = jwtService.verify<JwtPayload>(token);

    expect(payload.sub).toBe(42);
    expect(payload.email).toBe('grace@example.com');
    expect(payload.given_name).toBe('Grace');
    expect(payload.family_name).toBe('Hopper');
  });
});
