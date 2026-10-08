import { buildDemoItinerary } from './demo-itinerary';

describe('buildDemoItinerary', () => {
  it('uses the keyword and defaults to two days', () => {
    const itinerary = buildDemoItinerary('Kyoto day trip', null);
    expect(itinerary.title).toBe('Kyoto day trip');
    expect(itinerary.durationDays).toBe(2);
    expect(itinerary.days).toHaveLength(2);
    expect(itinerary.days[1].stay).toBeNull();
    expect(itinerary.summary).toContain('TRIP_DEMO_MODE');
  });

  it('honours an explicit length and caps it', () => {
    expect(buildDemoItinerary('Osaka', 1).days).toHaveLength(1);
    expect(buildDemoItinerary('Osaka', 30).days).toHaveLength(5);
  });

  it('writes Chinese copy when the keyword contains CJK', () => {
    const itinerary = buildDemoItinerary('京都賞楓', 1);
    expect(itinerary.summary).toContain('示範行程');
    expect(itinerary.days[0].items[0].category).toBe('attraction');
  });
});
