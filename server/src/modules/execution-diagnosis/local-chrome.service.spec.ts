import { LocalChromeService } from './local-chrome.service';

describe('LocalChromeService', () => {
  const engine = { id: 7, code: 'chatgpt', vendor: 'OpenAI', baseUrl: null };

  function createService() {
    const profile = {
      id: 1,
      engineId: engine.id,
      profileId: 'profile-7',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      availability: 'unavailable',
      lastCheckedAt: null,
      lastFailureReason: null,
      lastReadyAt: null,
    };
    const engines = { findOne: jest.fn().mockResolvedValue(engine) };
    const profiles = {
      findOne: jest.fn().mockResolvedValue(profile),
      create: jest.fn((value) => ({ ...profile, ...value })),
      save: jest.fn(async (value) => value),
      remove: jest.fn(),
    };
    const launches = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn(),
    };
    const context = {
      pages: jest.fn().mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/') }]),
      newPage: jest.fn(),
      close: jest.fn(),
    };
    const browser = {
      launchPersistentContext: jest.fn().mockResolvedValue(context),
    };
    const processInspector = {
      findControlledChrome: jest.fn().mockResolvedValue({ pid: 731, launchId: 'old-launch', profilePath: profile.profilePath }),
      kill: jest.fn().mockResolvedValue(undefined),
    };
    const service = new LocalChromeService(engines as never, profiles as never, launches as never, {
      browser,
      processInspector,
      chromePath: () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      appDataPath: () => '/tmp/geocite',
    });
    return { service, profiles, launches, browser, processInspector, context };
  }

  it('仅关闭同 launchId 且同 profilePath 的受控 Chrome', async () => {
    const { service, launches, processInspector } = createService();
    launches.findOne.mockResolvedValue({
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'old-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    });

    await service.reset(engine);
    await expect(service.closePreviousLaunch(engine.id)).resolves.toEqual({ closed: true });
    expect(processInspector.kill).toHaveBeenCalledWith(expect.objectContaining({
      launchId: expect.any(String),
      profilePath: expect.stringContaining('/playwright-profiles/'),
    }));
  });

  it('拒绝仅凭 PID 或单一标识关闭不匹配的 Chrome 进程', async () => {
    const { service, launches, processInspector } = createService();
    launches.findOne.mockResolvedValue({
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'expected-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    });
    processInspector.findControlledChrome.mockResolvedValue({
      pid: 731,
      launchId: 'another-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
    });

    await expect(service.closePreviousLaunch(engine.id)).resolves.toEqual({ closed: false });
    expect(processInspector.kill).not.toHaveBeenCalled();
  });

  it('每次启动生成新的 launchId，并把它传给本机 Chrome', async () => {
    const { service, browser } = createService();

    await service.reset(engine);

    expect(browser.launchPersistentContext).toHaveBeenCalledWith(
      '/tmp/geocite/playwright-profiles/chatgpt',
      expect.objectContaining({
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: false,
        args: [expect.stringMatching(/^--geocite-review-launch-id=/)],
      }),
    );
  });

  it('将登录页标为 pending_login，且不读取或保存密码和验证码', async () => {
    const { service, profiles, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/auth/login') }]);

    await expect(service.reset(engine)).resolves.toBe('pending_login');
    expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({
      availability: 'pending_login',
      lastFailureReason: null,
    }));
  });

  it('验证码、风控与检查异常统一标为 unavailable 并保留失败原因', async () => {
    const { service, profiles, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/verify') }]);

    await expect(service.reset(engine)).resolves.toBe('unavailable');
    expect(profiles.save).toHaveBeenCalledWith(expect.objectContaining({
      availability: 'unavailable',
      lastFailureReason: expect.stringContaining('验证码或风控'),
    }));
  });
});
