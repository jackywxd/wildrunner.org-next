import { expect, test } from "@playwright/test";

import { pronounce } from "@/lib/reader/pronounce";

/**
 * U-SAY — how a written shorthand is said out loud.
 *
 * HALF OF THIS FILE ASSERTS THAT NOTHING HAPPENS, and that half is the point.
 * The complaint that started this work was that the reader says "三百零七" for
 * a 3:07 marathon and "四百一十五" for a 4:15 pace, so the obvious move is a
 * rule for three-digit runs and one for `H:MM`. Scanning the 15 seeded
 * articles is what stopped it:
 *
 *   - `H:MM` has seven hits and **two are clock times**, not durations.
 *   - three-digit runs have **120** hits, mostly street addresses and phone
 *     numbers.
 *
 * So those cases are left for the pass that has context. These tests pin that
 * decision, because the tempting rule will occur to the next person too — and
 * a regression here is silent, since a wrongly expanded number still reads as
 * a perfectly fluent sentence.
 */
test.describe("U-SAY units a voice should not spell out", () => {
  test("U-SAY-1: a distance in K is said in 公里", () => {
    // The five in the corpus: 110K, 70K, 25K, 35K, 80K.
    expect(pronounce("7月魁北克的QMT的110K")).toBe("7月魁北克的QMT的110公里");
    expect(pronounce("最後35K大腿開始抽筋")).toBe("最後35公里大腿開始抽筋");
    // The digits are deliberately not rewritten — every engine reads 35 as
    // 三十五 already, and rewriting numbers is a second class of mistake.
    expect(pronounce("110K")).toContain("110");
  });

  test("U-SAY-2: a unit that already spells itself out is left alone", () => {
    // The guard that keeps this rule from corrupting a real unit.
    for (const kept of ["10KM", "5Kg", "100Kcal", "300Kb"]) {
      expect(pronounce(kept), kept).toBe(kept);
    }
  });

  test("U-SAY-3: a distance in M is said in 英里", () => {
    // Three hits, all miles: Fat Dog 120 is a 120-mile race.
    expect(pronounce("完成了胖狗120M")).toBe("完成了胖狗120英里");
    expect(pronounce("其他人都報了100M")).toBe("其他人都報了100英里");
  });

  test("U-SAY-4: H:MM is left exactly as written, duration or not", () => {
    // FIVE of the corpus's seven are durations and TWO are clock times. A rule
    // that reads 3:36 as 三小時三十六分 reads 晚上9:45 the same way, and a start
    // time announced as a duration is worse than one read flatly.
    expect(pronounce("最後完賽時間是3:36。")).toBe("最後完賽時間是3:36。");
    expect(pronounce("时间已经是晚上9:45了")).toBe("时间已经是晚上9:45了");
    expect(pronounce("8:15全马和半马同时出发")).toBe("8:15全马和半马同时出发");
  });

  test("U-SAY-5: a bare three-digit number is left alone", () => {
    // 307 really is a 3:07 marathon — and the same shape is 120 other things
    // in this corpus, nearly all of them addresses and phone numbers.
    expect(pronounce("柏林跑了307")).toBe("柏林跑了307");
    expect(pronounce("720 S Michigan Ave")).toBe("720 S Michigan Ave");
    expect(pronounce("Phone: 312-922-4400")).toBe("Phone: 312-922-4400");
    expect(pronounce("保持415左右的配速")).toBe("保持415左右的配速");
  });

  test("U-SAY-6: decorative quotes go, the words inside stay", () => {
    expect(pronounce("這個“習慣”的好處")).toBe("這個習慣的好處");
    expect(pronounce("目标是“无伤安全完赛”")).toBe("目标是无伤安全完赛");
    // The Traditional convention this site writes in is untouched: the corpus
    // has none inside a sentence to measure, so the rule stays where the
    // evidence is.
    expect(pronounce("他說「跑完再說」")).toBe("他說「跑完再說」");
  });

  test("U-SAY-7: an untouched sentence comes back unchanged", () => {
    // The control. Without it every assertion above would also pass for a
    // function that returned its input, which is what a broken regex leaves.
    const plain = "比賽日的天氣可以用完美來形容，早上起來13度左右，體感很舒服。";
    expect(pronounce(plain)).toBe(plain);
  });
});
