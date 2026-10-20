import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./service', () => ({
  authFetchWithStatus: vi.fn(),
  fetchServiceBlob: vi.fn(),
  postServiceForm: vi.fn(),
  postServiceFormResult: vi.fn(),
}));

import { authFetchWithStatus } from './service';
import { deckImageFailureOf, commitDeckKlipyStage } from './deckImages';

describe('deckImageFailureOf', () => {
  it('maps 404 to an expired stage', () => {
    expect(deckImageFailureOf({ msg: 'Stage not found or expired', status: 404 })).toBe('expired');
  });
  it('maps 503 to busy', () => {
    expect(deckImageFailureOf({ msg: 'Busy, try again', status: 503 })).toBe('busy');
  });
  it('maps the too-large message and 413 to tooLarge', () => {
    expect(deckImageFailureOf({ msg: 'Result too large', status: 400 })).toBe('tooLarge');
    expect(deckImageFailureOf({ msg: 'x', status: 413 })).toBe('tooLarge');
  });
  it('maps anything else to failed', () => {
    expect(deckImageFailureOf({ msg: 'invalid stage id', status: 400 })).toBe('failed');
  });
});

describe('commitDeckKlipyStage', () => {
  beforeEach(() => { vi.mocked(authFetchWithStatus).mockReset(); });

  const reply = (status: number, body: unknown) =>
    ({ response: new Response(JSON.stringify(body), { status }), status });

  it('posts the crop as a JSON body to the stage route and returns the id', async () => {
    vi.mocked(authFetchWithStatus).mockResolvedValue(reply(200, { id: 'abc' }));
    expect(await commitDeckKlipyStage('s 1', '0,0,1,1')).toEqual({ id: 'abc' });
    expect(authFetchWithStatus).toHaveBeenCalledWith('/deck/images/stage/s%201', { method: 'POST', body: { crop: '0,0,1,1' } });
  });

  it('maps JSON error replies by status', async () => {
    vi.mocked(authFetchWithStatus).mockResolvedValueOnce(reply(404, { msg: 'Stage not found or expired' }));
    expect(await commitDeckKlipyStage('s', 'c')).toEqual({ failure: 'expired' });
    vi.mocked(authFetchWithStatus).mockResolvedValueOnce(reply(503, { msg: 'Busy, try again' }));
    expect(await commitDeckKlipyStage('s', 'c')).toEqual({ failure: 'busy' });
    vi.mocked(authFetchWithStatus).mockResolvedValueOnce(reply(400, { msg: 'Result too large' }));
    expect(await commitDeckKlipyStage('s', 'c')).toEqual({ failure: 'tooLarge' });
  });

  it('reports failed when the service never answers', async () => {
    vi.mocked(authFetchWithStatus).mockResolvedValue({ response: null, status: 0 });
    expect(await commitDeckKlipyStage('s', 'c')).toEqual({ failure: 'failed' });
  });
});
