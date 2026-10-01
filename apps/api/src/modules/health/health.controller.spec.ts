import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  const healthCheckService = { check: jest.fn() };
  const typeOrmIndicator = { pingCheck: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: TypeOrmHealthIndicator, useValue: typeOrmIndicator },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('pings the database through Terminus', async () => {
    const result = { status: 'ok', info: { database: { status: 'up' } } };
    typeOrmIndicator.pingCheck.mockResolvedValue({ database: { status: 'up' } });
    healthCheckService.check.mockImplementation(async (checks: Array<() => unknown>) => {
      await Promise.all(checks.map((fn) => fn()));
      return result;
    });

    await expect(controller.check()).resolves.toEqual(result);
    expect(typeOrmIndicator.pingCheck).toHaveBeenCalledWith('database', { timeout: 1500 });
  });
});
