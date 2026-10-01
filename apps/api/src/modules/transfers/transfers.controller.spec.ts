import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { TransfersController } from './transfers.controller';
import type { TransfersService } from './transfers.service';

describe('TransfersController', () => {
  const user = { id: 'user-1', role: 'USER' as const };
  const service = {
    transfer: jest.fn().mockResolvedValue({ status: 201, body: { id: 't-1' }, replayed: true }),
  };
  const controller = new TransfersController(service as unknown as TransfersService);
  const res = { status: jest.fn(), setHeader: jest.fn() };

  it('transfers with the idempotency key and flags replays', async () => {
    const dto = { fromAccountId: 'a', toAlias: '@luis', amountMinor: 100 };
    await expect(
      controller.create(user, 'key-12345678', dto, res as unknown as Response),
    ).resolves.toEqual({ id: 't-1' });
    expect(service.transfer).toHaveBeenCalledWith('user-1', dto, 'key-12345678');
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it.each([
    [{ fromAccountId: 'a', amountMinor: 100 }],
    [{ fromAccountId: 'a', amountMinor: 100, toAlias: '@x', toAccountNumber: '1000-0000-0001' }],
  ])('requires exactly one recipient field', async (dto) => {
    await expect(
      controller.create(user, 'key-12345678', dto, res as unknown as Response),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
