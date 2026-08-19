import { controlledProfilePath } from './local-chrome.service';

describe('controlledProfilePath', () => {
  it('uses a stable engine id and code directory below the project profile root', () => {
    expect(controlledProfilePath('/project/server/data/playwright-profiles', { id: 3, code: 'deepseek' })).toBe('/project/server/data/playwright-profiles/engine-3-deepseek');
  });
});
