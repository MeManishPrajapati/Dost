import { describe, expect, it } from "vitest";
import { SentenceBuffer } from "../src/voice/sentence-buffer.js";

describe("SentenceBuffer", () => {
  it("groups English tokens into sentences", () => {
    const buffer = new SentenceBuffer();
    const chunks: string[] = [];
    const tokens = [
      "Tomorrow",
      " you",
      " have",
      " a",
      " meeting",
      " at",
      " 10",
      " AM.",
      " Your",
      " next",
      " appointment",
      " is",
      " at",
      " 4",
      " PM.",
    ];
    for (const token of tokens) chunks.push(...buffer.push(token));
    expect(chunks).toEqual([
      "Tomorrow you have a meeting at 10 AM.",
      "Your next appointment is at 4 PM.",
    ]);
    expect(buffer.flush()).toBeNull();
  });

  it("splits Hindi on danda", () => {
    const buffer = new SentenceBuffer();
    const chunks = [
      ...buffer.push("कल आपकी मीटिंग सुबह 10 बजे है।"),
      ...buffer.push(" अगली मीटिंग शाम को है।"),
    ];
    expect(chunks).toEqual([
      "कल आपकी मीटिंग सुबह 10 बजे है।",
      "अगली मीटिंग शाम को है।",
    ]);
  });

  it("splits Gujarati and Hinglish sentences", () => {
    const buffer = new SentenceBuffer();
    const gujarati = buffer.push("તમારી મીટિંગ સવારે 10 વાગ્યે છે. પછી બપોરે બીજી મીટિંગ છે.");
    expect(gujarati).toEqual([
      "તમારી મીટિંગ સવારે 10 વાગ્યે છે.",
      "પછી બપોરે બીજી મીટિંગ છે.",
    ]);
    expect(buffer.flush()).toBeNull();

    const hinglish = new SentenceBuffer();
    const mixed = hinglish.push("Kal aapki meeting 10 AM par hai. Aaj kya plan hai?");
    expect(mixed).toEqual(["Kal aapki meeting 10 AM par hai.", "Aaj kya plan hai?"]);
  });

  it("keeps decimals and titles together", () => {
    const buffer = new SentenceBuffer();
    expect(buffer.push("The total is 10.5 rupees.")).toEqual(["The total is 10.5 rupees."]);
    const titled = new SentenceBuffer();
    expect(titled.push("Dr. Patel is free at 10 a.m. Tomorrow works too.")).toEqual([
      "Dr. Patel is free at 10 a.m.",
      "Tomorrow works too.",
    ]);
  });

  it("splits a long unpunctuated buffer on a word boundary", () => {
    const buffer = new SentenceBuffer({ maxChars: 80 });
    const words = Array.from({ length: 30 }, () => "hello").join(" ");
    const chunks = buffer.push(words);
    const tail = buffer.flush();
    if (tail) chunks.push(tail);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 80)).toBe(true);
    expect(chunks.join(" ")).toBe(words);
  });
});
