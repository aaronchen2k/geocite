import { Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { ExecutionDiagnosisService } from './execution-diagnosis.service';

describe('ExecutionDiagnosisService events', () => {
  it('运行快照包含已持久化的步骤日志', () => {
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    const snapshot = (service as unknown as { serialize(run: unknown): unknown }).serialize({
      id: 7, brandId: 3, status: 'succeeded', rulesVersion: 'v1', summary: null,
      createdAt: new Date('2026-08-14T00:00:00.000Z'), startedAt: null, finishedAt: null, steps: [],
      events: [{ sequence: 2, type: 'log', data: { number: 2, message: '入口页返回 HTTP 200' }, createdAt: new Date('2026-08-14T00:00:01.000Z') }],
    }) as { events?: unknown[] };

    expect(snapshot.events).toEqual([{ number: 2, message: '入口页返回 HTTP 200', createdAt: '2026-08-14T00:00:01.000Z' }]);
  });

  it('在任务已结束时仍回放已持久化的 SSE 事件', async () => {
    const eventsRepository = {
      find: jest.fn().mockResolvedValue([{ sequence: 1, type: 'run', data: { status: 'partial' }, createdAt: new Date('2026-08-14T00:00:00.000Z') }]),
    };
    const service = new ExecutionDiagnosisService(
      {} as never, {} as never, {} as never, {} as never, {} as never, eventsRepository as never, {} as never, {} as never, {} as never, {} as never,
    );
    const completed = new Subject();
    completed.complete();
    (service as unknown as { streams: Map<number, Subject<MessageEvent>> }).streams.set(7, completed);

    const received: unknown[] = [];
    await new Promise<void>((resolve, reject) => service.events(7)?.subscribe({ next: (event) => received.push(event.data), error: reject, complete: resolve }));

    expect(received).toEqual([{ sequence: 1, type: 'run', status: 'partial', createdAt: '2026-08-14T00:00:00.000Z' }]);
  });

  it('采样时从独立问题表读取当前品牌的问题', async () => {
    const brandEngines = { find: jest.fn().mockResolvedValue([]) };
    const diagnosisQuestions = { find: jest.fn().mockResolvedValue([{question: '独立表问题'}]) };
    const service = new ExecutionDiagnosisService(
      {} as never, brandEngines as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, diagnosisQuestions as never,
    );

    await (service as unknown as { sampleEngines(runId: number, brand: {id: number; questions: string[]}): Promise<unknown> }).sampleEngines(7, {id: 5, questions: ['旧主表问题']});

    expect(diagnosisQuestions.find).toHaveBeenCalledWith({where: {brandId: 5}, order: {ordr: 'ASC', id: 'ASC'}});
  });
});
