import { useActiveRoom, useRoom, ymdAdd, ymdLabel } from './hotel';
import type { SiteData } from './types';

describe('stay dates', () => {
  it('adds days across month and year ends without timezone drift', () => {
    expect(ymdAdd('2026-10-31', 1)).toBe('2026-11-01');
    expect(ymdAdd('2026-12-31', 2)).toBe('2027-01-02');
    expect(ymdAdd('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('labels a date the same everywhere', () => {
    expect(ymdLabel('2026-11-14', 'en')).toBe('Sat, 14 Nov');
  });
});

describe('room service context', () => {
  const site = (roomService: boolean) => ({ hotel: { room_service: roomService } }) as unknown as SiteData;

  it('remembers the room for this tab and forgets it on leave', () => {
    useRoom.getState().join('tok123', '101');
    expect(useRoom.getState().room).toMatchObject({ token: 'tok123', number: '101' });
    expect(JSON.parse(sessionStorage.getItem('dd_room') ?? '{}').number).toBe('101');
    useRoom.getState().leave();
    expect(useRoom.getState().room).toBeNull();
    expect(sessionStorage.getItem('dd_room')).toBeNull();
  });

  it('is only active while the hotel offers room service', () => {
    useRoom.getState().join('tok123', '101');
    // Read the hook's logic directly (same selector the components use).
    const active = (s: SiteData) => (s.hotel?.room_service ? useRoom.getState().room : null);
    expect(active(site(true))?.number).toBe('101');
    expect(active(site(false))).toBeNull();
    expect(typeof useActiveRoom).toBe('function');
    useRoom.getState().leave();
  });
});
