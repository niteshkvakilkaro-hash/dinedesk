import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowInApp, androidBridge, saveBlob, saveViaBridge, type AndroidBridge } from './dinedeskApp';
import { printPage, printSlip, slipDocument, slipTitle } from './print';

function fakeBridge() {
  const parts: string[] = [];
  const b = {
    printHtml: vi.fn(),
    printPage: vi.fn(),
    saveBegin: vi.fn(() => 'f1'),
    saveChunk: vi.fn((_id: string, data: string) => (parts.push(data), true)),
    saveEnd: vi.fn(() => true),
    allowHost: vi.fn(),
  } satisfies AndroidBridge;
  return { b, parts };
}

const install = (b: AndroidBridge | undefined) => Object.defineProperty(window, 'DineDeskAndroid', { value: b, configurable: true, writable: true });

afterEach(() => install(undefined));

describe('Android app bridge', () => {
  it('is only used when the app added it', () => {
    expect(androidBridge(window)).toBeNull();
    expect(androidBridge({ DineDeskAndroid: { printHtml: () => undefined } })).toBeNull();
    const { b } = fakeBridge();
    install(b);
    expect(androidBridge()).toBe(b);
  });

  it('sends a file in base64 parts that join back to the bytes', async () => {
    const { b, parts } = fakeBridge();
    const bytes = new Uint8Array(1_200_000).map((_, i) => i % 251);
    await saveViaBridge(b, new Blob([bytes], { type: 'application/zip' }), 'export.zip', true);
    expect(b.saveBegin).toHaveBeenCalledWith('export.zip', 'application/zip');
    expect(parts).toHaveLength(3);
    const back = parts.flatMap((p) => Array.from(atob(p), (c) => c.charCodeAt(0)));
    expect(back).toEqual(Array.from(bytes));
    expect(b.saveEnd).toHaveBeenCalledWith('f1', true);
  });

  it('fails loudly when the app refuses the file', async () => {
    const { b } = fakeBridge();
    b.saveBegin.mockReturnValue('');
    await expect(saveViaBridge(b, new Blob(['x']), 'a.csv')).rejects.toThrow();
  });

  it('saves downloads through the app when inside it', async () => {
    const { b } = fakeBridge();
    install(b);
    await saveBlob(new Blob(['a,b'], { type: 'text/csv' }), 'sales.csv');
    expect(b.saveBegin).toHaveBeenCalledWith('sales.csv', 'text/csv');
  });

  it('lets a confirmed place open inside the app', () => {
    const { b } = fakeBridge();
    install(b);
    allowInApp('https://spicehouse.in/t/abc');
    expect(b.allowHost).toHaveBeenCalledWith('spicehouse.in');
  });

  it('prints slips and pages through the app instead of window.print', () => {
    const { b } = fakeBridge();
    install(b);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const html = slipDocument('<b>x</b>', 80, 'KOT #12 & co');
    printSlip(html);
    expect(b.printHtml).toHaveBeenCalledWith(html, 'KOT #12 & co');
    expect(document.querySelector('iframe')).toBeNull();
    document.title = 'Table QR codes';
    printPage();
    expect(b.printPage).toHaveBeenCalledWith('Table QR codes');
    expect(print).not.toHaveBeenCalled();
    print.mockRestore();
  });

  it('reads the slip title', () => {
    expect(slipTitle('<html><title>Bill &lt;7&gt;</title>')).toBe('Bill <7>');
    expect(slipTitle('<p>no title</p>')).toBe('DineDesk');
  });
});
