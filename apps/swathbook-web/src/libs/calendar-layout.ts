/**
 * Side-by-side layout for overlapping events in a day column, like most
 * calendars: events that overlap (directly or through a chain) form a cluster,
 * each event takes the first lane free at its start, and every event in the
 * cluster is as wide as one lane.
 */
export type TimedEvent = { id: string; start: number; end: number };
export type EventLayout = { lane: number; lanes: number };

export function layoutDay(events: TimedEvent[]): Map<string, EventLayout> {
    const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
    const result = new Map<string, EventLayout>();

    let cluster: Array<{ id: string; lane: number }> = [];
    let laneEnds: number[] = [];
    let clusterEnd = -Infinity;

    const closeCluster = () => {
        for (const item of cluster) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
        cluster = [];
        laneEnds = [];
    };

    for (const event of sorted) {
        // Treat zero-length events as a minute long so they still claim a lane.
        const end = Math.max(event.end, event.start + 1);
        if (event.start >= clusterEnd) closeCluster();
        let lane = laneEnds.findIndex((laneEnd) => laneEnd <= event.start);
        if (lane === -1) {
            lane = laneEnds.length;
            laneEnds.push(end);
        } else {
            laneEnds[lane] = end;
        }
        cluster.push({ id: event.id, lane });
        clusterEnd = Math.max(clusterEnd, end);
    }
    closeCluster();
    return result;
}
