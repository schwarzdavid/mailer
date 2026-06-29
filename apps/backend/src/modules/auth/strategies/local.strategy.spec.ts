import { Logger, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStrategy } from './local.strategy';
import { CredentialsService } from '../services/credentials.service';
import { UserDto } from '../../user/dtos/user.dto';

describe('LocalStrategy', () => {
  let strategy: LocalStrategy;
  let validateCredentials: ReturnType<typeof vi.fn>;

  const user: UserDto = Object.assign(new UserDto(), {
    userId: 1,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
  });

  beforeEach(() => {
    // Keep the failure path's logger.error out of the test output.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    validateCredentials = vi.fn();
    const credentialsService = {
      validateCredentials,
    } as unknown as CredentialsService;

    strategy = new LocalStrategy(credentialsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the user the credentials service validates', async () => {
    validateCredentials.mockResolvedValue(user);

    const result = await strategy.validate('ada@example.com', 'secret');

    expect(result).toBe(user);
    expect(validateCredentials).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret',
    });
  });

  it('translates any validation failure into an UnauthorizedException', async () => {
    validateCredentials.mockRejectedValue(new Error('boom'));

    await expect(
      strategy.validate('ada@example.com', 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
