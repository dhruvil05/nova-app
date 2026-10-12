import { formatEdited, formatListDate, formatTime } from '../formatDate';

const now = new Date(2026, 9, 11, 18, 0).getTime(); // 11 Oct 2026, 6:00 pm local

describe('formatDate', () => {
  it('formats 12-hour times', () => {
    expect(formatTime(new Date(2026, 9, 11, 0, 5).getTime())).toBe('12:05 am');
    expect(formatTime(new Date(2026, 9, 11, 12, 0).getTime())).toBe('12:00 pm');
    expect(formatTime(new Date(2026, 9, 11, 14, 14).getTime())).toBe('2:14 pm');
  });

  it('formats list dates relative to today', () => {
    expect(formatListDate(new Date(2026, 9, 11, 14, 14).getTime(), now)).toBe('Today, 2:14 pm');
    expect(formatListDate(new Date(2026, 9, 10, 23, 59).getTime(), now)).toBe('Yesterday');
    expect(formatListDate(new Date(2026, 9, 8, 9, 0).getTime(), now)).toBe('8 Oct');
    expect(formatListDate(new Date(2025, 11, 31, 9, 0).getTime(), now)).toBe('31 Dec 2025');
  });

  it('formats the editor meta line', () => {
    expect(formatEdited(new Date(2026, 9, 8, 19, 30).getTime(), now)).toBe('Edited 8 Oct, 7:30 pm');
    expect(formatEdited(new Date(2026, 9, 11, 9, 0).getTime(), now)).toBe('Edited today, 9:00 am');
  });
});
