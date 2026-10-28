/**
 * توحيد أرقام الجوال الفلسطينية إلى صيغة E.164: +9705XXXXXXXX
 * يقبل: 0599123456 / 599123456 / +970599123456 / 00970599123456 / +972599123456
 */
export function normalizePhone(input: string): string | null {
  const digits = (input ?? '').replace(/[\s\-()]/g, '').replace(/^\+/, '').replace(/^00/, '');
  const m = digits.match(/^(?:970|972)?0?(5\d{8})$/);
  return m ? `+970${m[1]}` : null;
}
