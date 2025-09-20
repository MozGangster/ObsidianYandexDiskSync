const mockRequestUrl = jest.fn();

jest.mock('obsidian', () => {
  const base = jest.requireActual('../../__mocks__/obsidian.js');
  return Object.assign({}, base, { requestUrl: mockRequestUrl });
});

const URL = 'https://example.com/resource';

describe('plugin HTTP helper', () => {
  let obsidian;
  let createPlugin;

  beforeEach(() => {
    jest.useRealTimers();
    jest.resetModules();
    mockRequestUrl.mockReset();
    obsidian = require('obsidian');
    ({ createPlugin } = require('../../tests/testUtils'));
  });

  afterEach(() => {
    mockRequestUrl.mockReset();
  });

  test('отсутствие токена приводит к ошибке без запроса', async () => {
    const plugin = createPlugin({ settings: { accessToken: '' } });

    await expect(plugin.http('GET', URL)).rejects.toThrow('Not connected');
    expect(mockRequestUrl).not.toHaveBeenCalled();
  });

  test('успешный JSON-запрос добавляет заголовок авторизации', async () => {
    const response = { status: 200, json: { ok: true } };
    mockRequestUrl.mockResolvedValue(response);
    const plugin = createPlugin();

    const data = await plugin.http('GET', URL, { expectJson: true });

    expect(data).toEqual({ ok: true });
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    expect(mockRequestUrl).toHaveBeenCalledWith({
      url: URL,
      method: 'GET',
      headers: { Authorization: 'OAuth test-token' },
      body: undefined,
      contentType: undefined,
    });
  });

  test('получение 429 вызывает повтор с ожиданием и обновление статуса', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();
    mockRequestUrl
      .mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '0.1' } })
      .mockResolvedValueOnce({ status: 200, json: { ok: true } });

    const promise = plugin.http('GET', URL, { expectJson: true });

    await Promise.resolve();
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(mockRequestUrl).toHaveBeenCalledTimes(2);
    expect(plugin.updateStatusBar).toHaveBeenCalledWith('Throttled');
    expect(plugin.logWarn).toHaveBeenCalledWith(expect.stringContaining('429'));
  });

  test('статусы из noRetryStatuses не повторяются и приводят к ошибке', async () => {
    const err = new Error('Forbidden');
    err.status = 403;
    err.text = 'Forbidden';
    mockRequestUrl.mockRejectedValue(err);
    const plugin = createPlugin();

    await expect(plugin.http('GET', URL, { noRetryStatuses: [403] })).rejects.toThrow('HTTP 403: Forbidden');
    expect(mockRequestUrl).toHaveBeenCalledTimes(1);
    expect(plugin.lastHttpError).toBe('HTTP 403: Forbidden');
  });

  test('исчерпание попыток повторов приводит к ошибке и логированию', async () => {
    jest.useFakeTimers();
    const err = new Error('Boom');
    err.status = 500;
    err.text = 'Server blew up';
    mockRequestUrl.mockRejectedValue(err);
    const plugin = createPlugin();

    const promise = plugin.http('GET', URL, { maxAttempts: 3 });

    const flush = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };

    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    jest.advanceTimersByTime(2000);
    await flush();

    await expect(promise).rejects.toThrow('HTTP 500: Server blew up');
    expect(mockRequestUrl).toHaveBeenCalledTimes(3);
    expect(plugin.logWarn).toHaveBeenCalledTimes(2);
    expect(plugin.lastHttpError).toBe('HTTP 500: Server blew up');
  });

  test('бинарный ответ возвращает arrayBuffer без парсинга', async () => {
    const buffer = Buffer.from('abc');
    mockRequestUrl.mockResolvedValue({ status: 200, arrayBuffer: buffer });
    const plugin = createPlugin();

    const data = await plugin.http('GET', URL, {}, true);

    expect(data).toBe(buffer);
    expect(mockRequestUrl).toHaveBeenCalledWith({
      url: URL,
      method: 'GET',
      headers: { Authorization: 'OAuth test-token' },
      body: undefined,
      contentType: undefined,
    });
  });
});
