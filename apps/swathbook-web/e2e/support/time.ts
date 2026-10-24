/** Date helpers for seeding jobs in the test business's zone (America/Chicago). */
const zone = "America/Chicago";

export function chicagoDateKey(date: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Tomorrow (Chicago) at `hour`:00 local time, as a UTC Date. */
export function tomorrowAt(hour: number) {
    const tomorrow = chicagoDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    // Chicago is UTC-5 or UTC-6; pick the offset that lands on `hour` locally.
    for (const offset of [5, 6]) {
        const candidate = new Date(`${tomorrow}T${String(hour + offset).padStart(2, "0")}:00:00.000Z`);
        const local = Number(new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(candidate));
        if (local === hour) return { date: tomorrow, at: candidate };
    }
    throw new Error("couldn't resolve Chicago time");
}
