package com.dinedesk.app;

import java.util.List;

/**
 * Checks RiderQueue with the JDK alone (no JUnit, no Android):
 *
 *   javac -d build/rq app/src/main/java/com/dinedesk/app/RiderQueue.java app/src/test/java/com/dinedesk/app/RiderQueueTest.java
 *   java -cp build/rq com.dinedesk.app.RiderQueueTest
 */
public class RiderQueueTest {
    private static int failures;
    private static int checks;

    private static void eq(Object want, Object got, String what) {
        checks++;
        if (want == null ? got != null : !want.equals(got)) {
            failures++;
            System.out.println("FAIL " + what + ": want <" + want + "> got <" + got + ">");
        }
    }

    private static String pt(int i) {
        return "{\"lat\":" + i + ",\"lng\":1}";
    }

    public static void main(String[] args) {
        // Cap: 500, oldest dropped.
        RiderQueue q = new RiderQueue();
        for (int i = 0; i < 520; i++) q.add(pt(i));
        eq(500, q.size(), "cap");
        eq(pt(20), q.batch().get(0), "oldest dropped");

        // Batches of at most 50, in order.
        List<String> b = q.batch();
        eq(50, b.size(), "batch size");
        eq(pt(69), b.get(49), "batch order");
        q.dropFirst(b.size());
        eq(450, q.size(), "after drop");
        eq(pt(70), q.batch().get(0), "next batch");

        // Small queue, body, bad points ignored.
        RiderQueue s = new RiderQueue();
        s.add(pt(1));
        s.add(pt(2));
        s.add(null);
        s.add("");
        s.add("{\"a\":1}\n{\"b\":2}");
        eq(2, s.size(), "bad points ignored");
        eq("{\"points\":[{\"lat\":1,\"lng\":1},{\"lat\":2,\"lng\":1}]}", RiderQueue.body(s.batch()), "body");
        s.dropFirst(10);
        eq(0, s.size(), "drop more than there is");

        // Stored and read back.
        RiderQueue r = new RiderQueue();
        for (int i = 0; i < 3; i++) r.add(pt(i));
        RiderQueue back = RiderQueue.parse(r.serialize());
        eq(3, back.size(), "round trip size");
        eq(r.serialize(), back.serialize(), "round trip");
        eq(0, RiderQueue.parse(null).size(), "parse null");
        eq(1, RiderQueue.parse("garbage\n" + pt(5) + "\n\n").size(), "parse skips junk");

        // Answers.
        RiderQueue.Decision d = RiderQueue.decide(200, null, true, 300);
        eq(RiderQueue.QueueAction.DROP_BATCH, d.queue, "200 drops batch");
        eq(false, d.stop, "200 on duty keeps going");
        eq(true, d.sent, "200 sent");
        eq(null, d.error, "200 no error");
        eq(300, d.intervalSec, "200 interval");
        eq(true, d.continueFlush(), "200 continues");

        d = RiderQueue.decide(200, null, false, 120);
        eq(true, d.stop, "200 off duty stops");
        eq("off_duty", d.error, "200 off duty error");
        eq(RiderQueue.QueueAction.DROP_BATCH, d.queue, "200 off duty drops batch");

        d = RiderQueue.decide(200, null, null, null);
        eq(false, d.stop, "200 without fields keeps going");
        eq(0, d.intervalSec, "200 without interval");
        eq(60, RiderQueue.decide(200, null, true, 5).intervalSec, "interval at least 60");

        for (int st : new int[]{401, 403}) {
            d = RiderQueue.decide(st, null, null, null);
            eq(true, d.stop, st + " stops");
            eq("unauthorized", d.error, st + " error");
        }

        d = RiderQueue.decide(409, "not_on_duty", null, null);
        eq(RiderQueue.QueueAction.CLEAR, d.queue, "409 clears");
        eq(true, d.stop, "409 stops");
        eq("off_duty", d.error, "409 error");

        d = RiderQueue.decide(422, "validation", null, null);
        eq(RiderQueue.QueueAction.DROP_BATCH, d.queue, "422 drops batch");
        eq(false, d.stop, "422 keeps going");
        eq(false, d.sent, "422 not sent");

        for (int st : new int[]{0, 429, 500, 502, 503}) {
            d = RiderQueue.decide(st, null, null, null);
            eq(RiderQueue.QueueAction.KEEP, d.queue, st + " keeps queue");
            eq(false, d.stop, st + " keeps going");
            eq("offline", d.error, st + " error");
            eq(false, d.continueFlush(), st + " ends this flush");
        }

        // A 422 in the middle of a flush: that batch goes, the next is tried.
        RiderQueue f = new RiderQueue();
        for (int i = 0; i < 120; i++) f.add(pt(i));
        int[] answers = {200, 422, 503};
        int k = 0;
        while (!f.isEmpty()) {
            List<String> batch = f.batch();
            RiderQueue.Decision x = RiderQueue.decide(answers[k++], null, true, null);
            if (x.queue == RiderQueue.QueueAction.DROP_BATCH) f.dropFirst(batch.size());
            else if (x.queue == RiderQueue.QueueAction.CLEAR) f.clear();
            if (!x.continueFlush()) break;
        }
        eq(20, f.size(), "flush: 200 + 422 dropped 100, 503 kept 20");

        // Times.
        eq("2026-10-15T07:30:00.000Z", RiderQueue.iso(1792049400000L), "iso");
        eq(1792049400000L, RiderQueue.parseIso("2026-10-15T07:30:00Z"), "parse Z");
        eq(1792049400000L, RiderQueue.parseIso("2026-10-15T13:00:00+05:30"), "parse +05:30");
        eq(1792049400000L, RiderQueue.parseIso("2026-10-15T13:00:00+0530"), "parse +0530");
        eq(1792049400000L, RiderQueue.parseIso("2026-10-15T07:30:00.000000Z"), "parse micros");
        eq(1792049400123L, RiderQueue.parseIso("2026-10-15T07:30:00.123Z"), "parse millis");
        eq(1792049400000L, RiderQueue.parseIso("2026-10-15T02:30:00-05:00"), "parse negative zone");
        eq(1792049400000L, RiderQueue.parseIso(RiderQueue.iso(1792049400000L)), "iso round trip");
        eq(-1L, RiderQueue.parseIso(null), "parse null");
        eq(-1L, RiderQueue.parseIso("tomorrow"), "parse junk");

        System.out.println(failures == 0 ? "OK " + checks + " checks" : failures + " of " + checks + " checks FAILED");
        if (failures > 0) System.exit(1);
    }
}
