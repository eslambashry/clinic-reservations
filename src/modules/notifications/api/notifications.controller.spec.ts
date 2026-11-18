import { NotificationsController } from './notifications.controller';
import { NOTIFICATION_CONSTANTS } from '../../../shared/config/constants';

const mk = () => ({ execute: jest.fn().mockResolvedValue('r') }) as any;

describe('NotificationsController', () => {
  const list = mk();
  const read = mk();
  const prefs = mk();
  const upd = mk();
  const c = new NotificationsController(list, read, prefs, upd);
  const user: any = { sub: 'u1' };

  it('list defaults the limit and forwards filters', async () => {
    await c.list({} as any, user);
    expect(list.execute).toHaveBeenLastCalledWith({ userId: 'u1', unreadOnly: undefined, cursor: undefined, limit: NOTIFICATION_CONSTANTS.DEFAULT_LIST_LIMIT });
    await c.list({ limit: 3, unreadOnly: true } as any, user);
    expect(list.execute).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 3, unreadOnly: true }));
  });

  it('read, preferences and update', async () => {
    await c.read('n', user);
    expect(read.execute).toHaveBeenCalledWith('n', 'u1');
    await c.preferences(user);
    expect(prefs.execute).toHaveBeenCalledWith('u1');
    await expect(c.updatePreferencesEndpoint({ preferences: [1] } as any, user)).resolves.toBeUndefined();
    expect(upd.execute).toHaveBeenCalledWith('u1', [1]);
  });
});
