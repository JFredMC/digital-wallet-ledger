import { DepositsController } from './deposits.controller';
import type { DepositsService } from './deposits.service';

describe('DepositsController', () => {
  it('deposits on behalf of the authenticated user', async () => {
    const service = { deposit: jest.fn().mockResolvedValue({ id: 'journal-1' }) };
    const controller = new DepositsController(service as unknown as DepositsService);
    const dto = { accountId: 'wallet-1', amountMinor: 1000 };

    await expect(controller.create({ id: 'user-1', role: 'USER' }, dto)).resolves.toEqual({
      id: 'journal-1',
    });
    expect(service.deposit).toHaveBeenCalledWith('user-1', dto);
  });
});
