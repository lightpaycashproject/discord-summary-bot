const db = require('../src/services/DatabaseService');

// Manual mock for Bun compatibility
db.clearChannelCache = jest.fn();
db.getStats = jest.fn();

const AdminCommand = require('../src/commands/AdminCommand');
const { admin } = require('../config');

describe('AdminCommand', () => {
  let mockInteraction;

  beforeEach(() => {
    mockInteraction = {
      user: { id: 'admin123' },
      channelId: 'chan123',
      options: {
        getSubcommand: jest.fn()
      },
      reply: jest.fn().mockResolvedValue({})
    };
    admin.userId = 'admin123';
    jest.clearAllMocks();
  });

  it('should deny non-admin users', async () => {
    mockInteraction.user.id = 'wronguser';
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('do not have permission')
    }));
  });

  it('should clear cache for admin', async () => {
    mockInteraction.options.getSubcommand.mockReturnValue('clear-cache');
    await AdminCommand.execute(mockInteraction);
    expect(db.clearChannelCache).toHaveBeenCalledWith('chan123');
    expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Cache cleared')
    }));
  });

  it('should show stats for admin', async () => {
    mockInteraction.options.getSubcommand.mockReturnValue('stats');
    db.getStats.mockReturnValue({ tweets: 10, summaries: 5 });
    await AdminCommand.execute(mockInteraction);
    expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Cached Tweets: 10')
    }));
  });
});
