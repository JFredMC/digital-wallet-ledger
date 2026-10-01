import { TransactionsController } from './transactions.controller';
import type { TransactionsService } from './transactions.service';

describe('TransactionsController', () => {
  it('lists the history of one of my accounts', async () => {
    const page = { items: [], nextCursor: null };
    const service = { list: jest.fn().mockResolvedValue(page) };
    const controller = new TransactionsController(service as unknown as TransactionsService);

    await expect(
      controller.list({ id: 'user-1', role: 'USER' }, 'acc-a', { limit: 5 }),
    ).resolves.toBe(page);
    expect(service.list).toHaveBeenCalledWith('user-1', 'acc-a', { limit: 5 });
  });
});
