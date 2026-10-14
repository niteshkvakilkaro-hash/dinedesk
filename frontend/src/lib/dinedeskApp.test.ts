import { appHomeUrl, forgetPlaces, isDineDeskApp, parseQrTarget, recentPlaces, rememberPlace, subdomainUrl } from './dinedeskApp';

const prod = { platformDomain: 'dinedesk.in', dev: false, loc: { protocol: 'https:', hostname: 'dinedesk.in', port: '' } };
const pc = { platformDomain: 'localhost', dev: true, loc: { protocol: 'http:', hostname: 'localhost', port: '5180' } };
const phone = { platformDomain: 'localhost', dev: true, loc: { protocol: 'http:', hostname: '192.168.1.20', port: '5180' } };

describe('isDineDeskApp', () => {
  beforeEach(() => sessionStorage.clear());

  it('recognises the app by its user agent token', () => {
    expect(isDineDeskApp('Mozilla/5.0 (Linux; Android 14; wv) Chrome/126 Mobile DineDeskApp/1', '')).toBe(true);
    expect(isDineDeskApp('Mozilla/5.0 (Windows NT 10.0) Chrome/126', '')).toBe(false);
  });

  it('?app=1 turns it on for the rest of the tab', () => {
    const ua = 'Mozilla/5.0 Chrome/126';
    expect(isDineDeskApp(ua, '?app=1')).toBe(true);
    expect(isDineDeskApp(ua, '')).toBe(true);
    sessionStorage.clear();
    expect(isDineDeskApp(ua, '?app=0')).toBe(false);
  });
});

describe('parseQrTarget', () => {
  it('accepts any page of a business on the platform domain (home, table QR, room QR)', () => {
    expect(parseQrTarget('https://haveli.dinedesk.in', prod)).toEqual({ url: 'https://haveli.dinedesk.in/', host: 'haveli.dinedesk.in', verified: true });
    expect(parseQrTarget('https://haveli.dinedesk.in/t/AbC123xyz', prod)?.url).toBe('https://haveli.dinedesk.in/t/AbC123xyz');
    expect(parseQrTarget('https://hotel-demo.dinedesk.in/r/9f8e7d?x=1#top', prod)?.url).toBe('https://hotel-demo.dinedesk.in/r/9f8e7d?x=1#top');
    // Typed without https://, upper case, http upgraded.
    expect(parseQrTarget('  Haveli.DineDesk.in/menu ', prod)?.url).toBe('https://haveli.dinedesk.in/menu');
    expect(parseQrTarget('http://haveli.dinedesk.in/t/abc', prod)?.url).toBe('https://haveli.dinedesk.in/t/abc');
  });

  it('rejects the platform itself, reserved and nested subdomains, other schemes and junk', () => {
    for (const text of [
      'https://dinedesk.in/signup',
      'https://app.dinedesk.in/dashboard',
      'https://www.dinedesk.in',
      'https://a.b.dinedesk.in',
      'javascript:alert(1)',
      'mailto:hi@dinedesk.in',
      'upi://pay?pa=x@upi',
      'WIFI:S:Cafe;T:WPA;P:secret;;',
      'https://user:pass@haveli.dinedesk.in',
      'hello world',
      '',
      'https://192.168.1.20:5180/app',
      'https://localhost',
      // nip.io is a development address only.
      'http://haveli.192.168.1.20.nip.io:5180',
    ]) {
      expect(parseQrTarget(text, prod), text).toBeNull();
    }
  });

  it("asks the server about other domains (a business's own domain)", () => {
    expect(parseQrTarget('https://hungryhaveli.in/t/abc', prod)).toEqual({ url: 'https://hungryhaveli.in/t/abc', host: 'hungryhaveli.in', verified: false });
    expect(parseQrTarget('https://bad_host.com', prod)).toBeNull();
  });

  it('development: <slug>.localhost on the PC, <slug>.<ip>.nip.io on a phone', () => {
    expect(parseQrTarget('http://hotel-demo.localhost:5180/r/tok', pc)?.url).toBe('http://hotel-demo.localhost:5180/r/tok');
    // A QR printed for the PC opens on the phone through nip.io.
    expect(parseQrTarget('http://hotel-demo.localhost:5180/t/tok', phone)).toEqual({ url: 'http://hotel-demo.192.168.1.20.nip.io:5180/t/tok', host: 'hotel-demo.localhost', verified: true });
    expect(parseQrTarget('http://haveli-demo.192.168.1.20.nip.io:5180/menu', phone)?.url).toBe('http://haveli-demo.192.168.1.20.nip.io:5180/menu');
    expect(parseQrTarget('http://localhost:5180/app', pc)).toBeNull();
    expect(parseQrTarget('http://192.168.1.20:5180/dashboard', phone)).toBeNull();
  });
});

describe('addresses', () => {
  it('builds a business address for where the app is', () => {
    expect(subdomainUrl('haveli', '/', prod.loc, 'dinedesk.in')).toBe('https://haveli.dinedesk.in/');
    expect(subdomainUrl('haveli', '/menu', pc.loc, 'localhost')).toBe('http://haveli.localhost:5180/menu');
    expect(subdomainUrl('haveli', '/', phone.loc, 'localhost')).toBe('http://haveli.192.168.1.20.nip.io:5180/');
  });

  it('goes back to the app home from a phone business site', () => {
    expect(appHomeUrl({ protocol: 'http:', hostname: 'haveli.192.168.1.20.nip.io', port: '5180' })).toBe('http://192.168.1.20:5180/app');
  });
});

describe('recently visited', () => {
  beforeEach(() => forgetPlaces());

  it('keeps the newest 8, one per host', () => {
    for (let i = 1; i <= 10; i++) rememberPlace({ host: `p${i}.dinedesk.in`, url: `https://p${i}.dinedesk.in`, name: `Place ${i}` }, i);
    rememberPlace({ host: 'p5.dinedesk.in', url: 'https://p5.dinedesk.in', name: 'Place 5' }, 11);
    const list = recentPlaces();
    expect(list).toHaveLength(8);
    expect(list.map((p) => p.name).slice(0, 3)).toEqual(['Place 5', 'Place 10', 'Place 9']);
  });

  it('survives broken or blocked storage', () => {
    localStorage.setItem('dd_app_recent', '{nope');
    expect(recentPlaces()).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberPlace({ host: 'a.dinedesk.in', url: 'https://a.dinedesk.in', name: 'A' })).not.toThrow();
    spy.mockRestore();
  });
});
