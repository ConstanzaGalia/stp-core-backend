import { buildWhatsAppLink, normalizePhoneAR } from './phone-ar.util';

describe('normalizePhoneAR', () => {
  it.each([
    ['11 2345 6789', '+5491123456789'],
    ['011 15 2345-6789', '+5491123456789'],
    ['15 2345 6789', null], // sin código de área no se puede interpretar
    ['(011) 2345-6789', '+5491123456789'],
    ['+54 9 11 2345 6789', '+5491123456789'],
    ['+54 11 2345 6789', '+5491123456789'],
    ['+54 11 15 2345 6789', '+5491123456789'],
    ['5491123456789', '+5491123456789'],
    ['541123456789', '+5491123456789'],
    ['0054 9 11 2345 6789', '+5491123456789'],
    ['351 15 123 4567', '+5493511234567'],
    ['0351 153 123456', '+5493513123456'], // los espacios no importan: 351 + 15 + 3123456
    ['0351 15 1234567', '+5493511234567'],
    ['2944 15 123456', '+5492944123456'],
    ['2944 123456', '+5492944123456'],
    ['91123456789', '+5491123456789'],
    ['+598 99 123 456', '+59899123456'],
    ['+1 415 555 0100', '+14155550100'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhoneAR(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['11 2345 678a'],
    ['1234'],
    ['0 0000 0000'],
    ['+12'],
    ['4123 456789'], // no existe área que empiece con 4
    ['+54 15 2345 6789'],
    ['+1234567890123456'],
  ])('rechaza %p', (input) => {
    expect(normalizePhoneAR(input)).toBeNull();
  });

  it('rechaza valores que no son texto', () => {
    expect(normalizePhoneAR(null)).toBeNull();
    expect(normalizePhoneAR(undefined)).toBeNull();
    expect(normalizePhoneAR(1123456789 as unknown as string)).toBeNull();
  });
});

describe('buildWhatsAppLink', () => {
  it('arma el link wa.me solo con dígitos', () => {
    expect(buildWhatsAppLink('+5491123456789')).toBe('https://wa.me/5491123456789');
  });
});
