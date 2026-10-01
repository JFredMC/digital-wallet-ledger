import type { Response } from 'express';
import { DepositsController } from './deposits.controller';
import type { DepositsService } from './deposits.service';

function setup(replayed: boolean) {
  const service = {
    deposit: jest.fn().mockResolvedValue({ status: 201, body: { id: 'journal-1' }, replayed }),
  };
  const res = { status: jest.fn(), setHeader: jest.fn() };
  const controller = new DepositsController(service as unknown as DepositsService);
  return { service, res, controller };
}

describe('DepositsController', () => {
  const user = { id: 'user-1', role: 'USER' as const };
  const dto = { accountId: 'wallet-1', amountMinor: 1000 };

  it('deposits on behalf of the authenticated user with the idempotency key', async () => {
    const { service, res, controller } = setup(false);
    await expect(
      controller.create(user, 'key-12345678', dto, res as unknown as Response),
    ).resolves.toEqual({ id: 'journal-1' });
    expect(service.deposit).toHaveBeenCalledWith('user-1', dto, 'key-12345678');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('flags replayed responses', async () => {
    const { res, controller } = setup(true);
    await controller.create(user, 'key-12345678', dto, res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });
});
