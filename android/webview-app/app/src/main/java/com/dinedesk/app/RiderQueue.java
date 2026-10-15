package com.dinedesk.app;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Rider location sharing without Android: the queue of positions waiting to be sent and what to do
 * with each upload answer. Plain Java so it can be checked with javac/java alone
 * (app/src/test/java/com/dinedesk/app/RiderQueueTest.java). Used only on the service's own thread.
 *
 * Points are kept as ready JSON objects ({"lat":..,"lng":..,...}), one per line when stored.
 */
final class RiderQueue {
    static final int MAX_POINTS = 500;
    static final int BATCH = 50;
    static final int MIN_INTERVAL_SEC = 60;
    static final int DEFAULT_INTERVAL_SEC = 300;

    private final ArrayDeque<String> points = new ArrayDeque<>();

    /** Adds a point; past MAX_POINTS the oldest go. */
    void add(String pointJson) {
        if (pointJson == null || pointJson.isEmpty() || pointJson.indexOf('\n') >= 0) return;
        points.addLast(pointJson);
        while (points.size() > MAX_POINTS) points.removeFirst();
    }

    /** The oldest points, at most BATCH. */
    List<String> batch() {
        List<String> out = new ArrayList<>(Math.min(BATCH, points.size()));
        for (String p : points) {
            if (out.size() >= BATCH) break;
            out.add(p);
        }
        return out;
    }

    void dropFirst(int n) {
        for (int i = 0; i < n && !points.isEmpty(); i++) points.removeFirst();
    }

    void clear() {
        points.clear();
    }

    int size() {
        return points.size();
    }

    boolean isEmpty() {
        return points.isEmpty();
    }

    /** Stored form: one point per line. */
    String serialize() {
        StringBuilder sb = new StringBuilder();
        for (String p : points) sb.append(p).append('\n');
        return sb.toString();
    }

    static RiderQueue parse(String stored) {
        RiderQueue q = new RiderQueue();
        if (stored == null) return q;
        for (String line : stored.split("\n")) {
            String t = line.trim();
            if (t.startsWith("{") && t.endsWith("}")) q.add(t);
        }
        return q;
    }

    /** The upload body: {"points":[...]} */
    static String body(List<String> batch) {
        StringBuilder sb = new StringBuilder("{\"points\":[");
        for (int i = 0; i < batch.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append(batch.get(i));
        }
        return sb.append("]}").toString();
    }

    // ---- Upload answers -------------------------------------------------------------------

    enum QueueAction { DROP_BATCH, CLEAR, KEEP }

    /** What to do after one upload. */
    static final class Decision {
        final QueueAction queue;
        /** Stop sharing (the service ends; the queue is cleared then anyway). */
        final boolean stop;
        /** For locationSharingStatus().lastError (the web's SharingError words); null = all fine. */
        final String error;
        /** The points reached the server (lastSentAt). */
        final boolean sent;
        /** The server's interval (clamped), or 0 when it said nothing. */
        final int intervalSec;

        Decision(QueueAction queue, boolean stop, String error, boolean sent, int intervalSec) {
            this.queue = queue;
            this.stop = stop;
            this.error = error;
            this.sent = sent;
            this.intervalSec = intervalSec;
        }

        /** Go on with the next batch in this flush. */
        boolean continueFlush() {
            return !stop && queue != QueueAction.KEEP;
        }
    }

    /**
     * status: the HTTP status, 0 when there was no answer (offline, timeout).
     * metaCode: meta.code of an error answer. onDuty / intervalSec: data.on_duty / data.interval_sec
     * of a 200 answer (null when missing).
     */
    static Decision decide(int status, String metaCode, Boolean onDuty, Integer intervalSec) {
        if (status >= 200 && status < 300) {
            int interval = intervalSec == null ? 0 : clampInterval(intervalSec);
            boolean off = onDuty != null && !onDuty;
            return new Decision(QueueAction.DROP_BATCH, off, off ? "off_duty" : null, true, interval);
        }
        if (status == 401 || status == 403) return new Decision(QueueAction.CLEAR, true, "unauthorized", false, 0);
        if (status == 409) {
            if ("not_on_duty".equals(metaCode)) return new Decision(QueueAction.CLEAR, true, "off_duty", false, 0);
            // Another conflict: these points won't go through on a retry either.
            return new Decision(QueueAction.DROP_BATCH, false, "position", false, 0);
        }
        if (status == 422) return new Decision(QueueAction.DROP_BATCH, false, "position", false, 0);
        if (status == 0 || status == 408 || status == 429 || status >= 500) return new Decision(QueueAction.KEEP, false, "offline", false, 0);
        // Other client errors (400, 404, 413…): retrying the same batch can't help.
        return new Decision(QueueAction.DROP_BATCH, false, "position", false, 0);
    }

    /** At least a minute; 5 minutes when unknown (same as the web's intervalMs). */
    static int clampInterval(Number sec) {
        if (sec == null) return DEFAULT_INTERVAL_SEC;
        double s = sec.doubleValue();
        if (Double.isNaN(s) || Double.isInfinite(s) || s <= 0) return DEFAULT_INTERVAL_SEC;
        return (int) Math.min(86400, Math.max(MIN_INTERVAL_SEC, Math.round(s)));
    }

    // ---- Times ----------------------------------------------------------------------------

    /** ISO 8601 UTC with milliseconds, e.g. 2026-10-15T07:30:00.000Z. */
    static String iso(long epochMs) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(epochMs));
    }

    /**
     * Parses what the server sends as expires_at (Carbon toIso8601String: 2026-10-15T19:30:00+05:30,
     * or …Z, with or without fractions). -1 when missing or unreadable.
     */
    static long parseIso(String s) {
        if (s == null) return -1;
        String t = s.trim();
        if (t.isEmpty() || "null".equals(t)) return -1;
        try {
            int tpos = t.indexOf('T');
            if (tpos < 0) return -1;
            // Split off the zone: Z, +hh:mm, -hh:mm, +hhmm (none = UTC).
            String zone = "+00:00";
            String main = t;
            if (t.endsWith("Z") || t.endsWith("z")) {
                main = t.substring(0, t.length() - 1);
            } else {
                int sign = Math.max(t.lastIndexOf('+'), t.lastIndexOf('-'));
                if (sign > tpos) {
                    zone = t.substring(sign);
                    main = t.substring(0, sign);
                    if (zone.length() == 5) zone = zone.substring(0, 3) + ":" + zone.substring(3);
                    if (zone.length() == 3) zone = zone + ":00";
                }
            }
            long fracMs = 0;
            int dot = main.indexOf('.');
            if (dot > 0) {
                String frac = (main.substring(dot + 1) + "000").substring(0, 3);
                fracMs = Long.parseLong(frac);
                main = main.substring(0, dot);
            }
            if (main.length() == 16) main = main + ":00"; // no seconds
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.ROOT);
            f.setLenient(false);
            Date d = f.parse(main + zone.replace(":", ""));
            return d.getTime() + fracMs;
        } catch (ParseException | RuntimeException e) {
            return -1;
        }
    }
}
