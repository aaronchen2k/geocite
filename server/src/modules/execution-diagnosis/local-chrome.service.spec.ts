import { ConflictException } from '@nestjs/common';
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
      pages: jest.fn().mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn() }]),
      newPage: jest.fn(),
      close: jest.fn(),
      cookies: jest.fn().mockResolvedValue([]),
    };
    const browser = {
      launchPersistentContext: jest.fn().mockResolvedValue(context),
    };
    const processInspector = {
      findControlledChrome: jest.fn().mockResolvedValue({ pid: 731, launchId: 'old-launch', profilePath: profile.profilePath }),
      kill: jest.fn().mockResolvedValue(undefined),
    };
    const removeDirectory = jest.fn().mockResolvedValue(undefined);
    const service = new LocalChromeService(engines as never, profiles as never, launches as never, {
      browser,
      processInspector,
      chromePath: () => '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      appDataPath: () => '/tmp/geocite',
      removeDirectory,
    });
    return { service, profiles, launches, browser, processInspector, removeDirectory, context };
  }

  it('仅关闭同 launchId 且同 profilePath 的受控 Chrome', async () => {
    const { service, launches, processInspector } = createService();
    const launch = {
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'old-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    };
    launches.findOne.mockResolvedValue(launch);
    processInspector.findControlledChrome
      .mockResolvedValueOnce({ pid: 731, launchId: launch.launchId, profilePath: launch.profilePath })
      .mockResolvedValueOnce(null);

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
        ignoreDefaultArgs: ['--no-sandbox'],
      }),
    );
  });

  it('优先使用引擎配置的官网地址打开登录窗口', async () => {
    const { service, context } = createService();
    const homepage = 'https://chatgpt.com/c';

    await service.reset({ ...engine, homepage });

    expect(context.pages()[0].goto).toHaveBeenCalledWith(homepage, expect.objectContaining({ waitUntil: 'domcontentloaded' }));
  });

  it('页面出现登录入口时标记为未登录', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/c'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue(['Log in']) }) }]);

    await expect(service.reset({ ...engine, homepage: 'https://chatgpt.com/c' })).resolves.toBe('pending_login');
  });

  it('千问访客会话即使能提问也标记为未登录', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.qianwen.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue(false) }]);

    await expect(service.reset({ ...engine, code: 'qwen', vendor: 'Alibaba', homepage: 'https://www.qianwen.com/' })).resolves.toBe('pending_login');
  });

  it('千问存在官方登录 Cookie 时标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.qianwen.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue(['登录']) }), evaluate: jest.fn().mockResolvedValue(true) }]);

    await expect(service.reset({ ...engine, code: 'qwen', vendor: 'Alibaba', homepage: 'https://www.qianwen.com/' })).resolves.toBe('ready');
  });

  it('豆包页面的实时未登录状态不能标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.doubao.com/chat/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue(false) }]);

    await expect(service.reset({ ...engine, code: 'doubao', vendor: 'ByteDance', homepage: 'https://www.doubao.com' })).resolves.toBe('pending_login');
  });

  it('文心页面的实时未登录状态不能标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://wenxin.baidu.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue(false) }]);

    await expect(service.reset({ ...engine, code: 'wenxin-yiyan', vendor: 'Baidu', homepage: 'https://wenxin.baidu.com' })).resolves.toBe('pending_login');
  });

  it('元宝页面显示未登录状态时不能标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://yuanbao.tencent.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue(true), waitForSelector: jest.fn().mockResolvedValue(undefined) }]);

    await expect(service.reset({ ...engine, code: 'yuanbao', vendor: 'Tencent', homepage: 'https://yuanbao.tencent.com/' })).resolves.toBe('pending_login');
  });

  it('Kimi 页面提示登录同步历史时不能标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.kimi.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue({ membershipStatus: 401, accountLabel: 'login', guestAvatarPresent: true }) }]);

    await expect(service.reset({ ...engine, code: 'kimi', vendor: 'Moonshot AI', homepage: 'https://www.kimi.com/' })).resolves.toBe('pending_login');
  });

  it('Kimi 未出现已登录账户特征时不能标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.kimi.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue({ membershipStatus: null, accountLabel: 'missing', guestAvatarPresent: false }) }]);

    await expect(service.reset({ ...engine, code: 'kimi', vendor: 'Moonshot AI', homepage: 'https://www.kimi.com/' })).resolves.toBe('pending_login');
  });

  it('Kimi 显示非登录用户名和会员升级按钮时标记为已就绪', async () => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.kimi.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue({ accountLabel: 'account', membershipUpgradePresent: true }) }]);

    await expect(service.reset({ ...engine, code: 'kimi', vendor: 'Moonshot AI', homepage: 'https://www.kimi.com/' })).resolves.toBe('ready');
  });

  it('Kimi 在读取登录特征前等待页面账户节点挂载', async () => {
    const { service, context } = createService();
    const waitForSelector = jest.fn().mockResolvedValue(undefined);
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue('https://www.kimi.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }), evaluate: jest.fn().mockResolvedValue({ accountLabel: 'account', membershipUpgradePresent: true }), waitForSelector }]);

    await service.reset({ ...engine, code: 'kimi', vendor: 'Moonshot AI', homepage: 'https://www.kimi.com/' });

    expect(waitForSelector).toHaveBeenCalledWith('.user-name', expect.objectContaining({ state: 'attached' }));
    expect(waitForSelector).toHaveBeenCalledWith('.membership-upgrade', expect.objectContaining({ state: 'attached' }));
  });

  it.each([
    ['deepseek', 'DeepSeek', 'https://chat.deepseek.com/'],
  ])('%s 页面出现登录入口时标记为未登录', async (code, vendor, homepage) => {
    const { service, context } = createService();
    context.pages.mockReturnValue([{ goto: jest.fn(), url: jest.fn().mockReturnValue(homepage), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue(['登录']) }), evaluate: jest.fn() }]);

    await expect(service.reset({ ...engine, code, vendor, homepage })).resolves.toBe('pending_login');
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
    const page = { goto: jest.fn(), url: jest.fn().mockReturnValue('https://chatgpt.com/'), locator: jest.fn().mockReturnValue({ allTextContents: jest.fn().mockResolvedValue([]) }) };
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

  it('运行中的受控 Chrome 未确认关闭时拒绝删除 profile', async () => {
    const { service, launches, processInspector, profiles, removeDirectory } = createService();
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

    await expect(service.deleteProfile(engine.id)).rejects.toBeInstanceOf(ConflictException);

    expect(removeDirectory).not.toHaveBeenCalled();
    expect(launches.delete).not.toHaveBeenCalled();
    expect(profiles.remove).not.toHaveBeenCalled();
  });

  it('SIGTERM 后重新枚举确认进程消失才将 launch 标记为 closed', async () => {
    const { service, launches, processInspector } = createService();
    const launch = {
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'expected-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    };
    launches.findOne.mockResolvedValue(launch);
    processInspector.findControlledChrome
      .mockResolvedValueOnce({ pid: 731, launchId: launch.launchId, profilePath: launch.profilePath })
      .mockResolvedValueOnce(null);

    await expect(service.closePreviousLaunch(engine.id)).resolves.toEqual({ closed: true });

    expect(processInspector.kill).toHaveBeenCalledTimes(1);
    expect(processInspector.findControlledChrome).toHaveBeenCalledTimes(2);
    expect(launch.launchStatus).toBe('closed');
  });

  it('SIGTERM 后进程持续存活时保留 running 且拒绝删除 profile', async () => {
    const { service, launches, processInspector, removeDirectory, profiles } = createService();
    const launch = {
      engineId: engine.id,
      profileId: 'profile-7',
      launchId: 'expected-launch',
      profilePath: '/tmp/geocite/playwright-profiles/chatgpt',
      launchStatus: 'running',
    };
    launches.findOne.mockResolvedValue(launch);
    processInspector.findControlledChrome.mockResolvedValue({ pid: 731, launchId: launch.launchId, profilePath: launch.profilePath });

    await expect(service.deleteProfile(engine.id)).rejects.toBeInstanceOf(ConflictException);

    expect(processInspector.kill).toHaveBeenCalledTimes(1);
    expect(processInspector.findControlledChrome).toHaveBeenCalledTimes(2);
    expect(launch.launchStatus).toBe('running');
    expect(removeDirectory).not.toHaveBeenCalled();
    expect(profiles.remove).not.toHaveBeenCalled();
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
