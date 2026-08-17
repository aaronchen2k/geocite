import { hasExactControlledChromeArguments, LocalChromeService } from './local-chrome.service';
import { getMetadataArgsStorage } from 'typeorm';
import { EngineWebReviewProfileEntity } from './web-review.entity';

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

  it('复用前台 context 时仍导航至该引擎的登录页检查状态', async () => {
    const { service, context } = createService();
    const page = { goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/') };
    context.pages.mockReturnValue([page]);

    await service.reset(engine);
    page.goto.mockClear();
    await service.refresh(engine);

    expect(page.goto).toHaveBeenCalledWith('https://chatgpt.com/auth/login', expect.objectContaining({ waitUntil: 'domcontentloaded' }));
  });

  it('为清洗后 code 相同的不同引擎创建不可碰撞的 profile 目录', async () => {
    const { service, profiles } = createService();
    profiles.findOne.mockResolvedValue(null);

    const slash = await (service as any).ensureProfile({ id: 11, code: 'a/b' });
    const question = await (service as any).ensureProfile({ id: 12, code: 'a?b' });

    expect(slash.profilePath).not.toBe(question.profilePath);
    expect(slash.profilePath).toContain('11');
    expect(question.profilePath).toContain('12');
  });

  it('为 profilePath 配置数据库唯一约束', () => {
    const profilePathIndex = getMetadataArgsStorage().indices.find((index) =>
      index.target === EngineWebReviewProfileEntity && Array.isArray(index.columns) && index.columns.includes('profilePath'),
    );

    expect(profilePathIndex?.unique).toBe(true);
  });

  it('持久化和状态响应只返回受控的失败码与中文脱敏文案', async () => {
    const { service, context } = createService();
    const rawFailure = 'ENOENT /Users/secret/profile https://private.example.com/token';
    context.pages.mockReturnValue([{ goto: jest.fn().mockRejectedValue(new Error(rawFailure)), url: jest.fn() }]);

    await expect(service.reset(engine)).resolves.toBe('unavailable');
    await expect(service.getStatus(engine.id)).resolves.toEqual(expect.objectContaining({
      failureCode: 'check_failed',
      lastFailureReason: '浏览器状态检查失败，请稍后重试',
    }));
    expect((await service.getStatus(engine.id)).lastFailureReason).not.toContain('/Users/secret');
    expect((await service.getStatus(engine.id)).lastFailureReason).not.toContain('private.example.com');
  });

  it('未确认关闭受控 Chrome 时保持 running 状态', async () => {
    const { service, launches, processInspector } = createService();
    const launch = {
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'expected-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    };
    launches.findOne.mockResolvedValue(launch);
    processInspector.findControlledChrome.mockResolvedValue({
      pid: 731,
      launchId: 'another-launch',
      profilePath: launch.profilePath,
    });

    await expect(service.closePreviousLaunch(engine.id)).resolves.toEqual({ closed: false });

    expect(launch.launchStatus).toBe('running');
    expect(launches.save).not.toHaveBeenCalledWith(expect.objectContaining({ launchStatus: 'closed' }));
  });

  it('仅接受精确匹配的 launchId 与 user-data-dir 命令行参数', () => {
    const profilePath = '/tmp/geocite/playwright-profiles/engine-7-chatgpt';
    const launchId = 'expected-launch';

    expect(hasExactControlledChromeArguments(
      `Google Chrome --geocite-review-launch-id=${launchId} --user-data-dir=${profilePath}`,
      launchId,
      profilePath,
    )).toBe(true);
    expect(hasExactControlledChromeArguments(
      `Google Chrome --geocite-review-launch-id=${launchId}-other --user-data-dir=${profilePath}-other`,
      launchId,
      profilePath,
    )).toBe(false);
  });
});
