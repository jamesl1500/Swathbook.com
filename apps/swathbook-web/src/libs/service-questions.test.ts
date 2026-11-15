import { describe, expect, it } from "vitest";
import { answerErrors, answersToSend, cleanOptions, parseQuestionsField, questionsFor, type ServiceQuestion } from "./service-questions";

const MODEL: ServiceQuestion = { id: "q-model", prompt: "Make and model?", kind: "text", options: [], required: true };
const KIND: ServiceQuestion = { id: "q-kind", prompt: "What kind of car?", kind: "choice", options: ["Sedan", "SUV", "Truck"], required: true };
const AVOID: ServiceQuestion = { id: "q-avoid", prompt: "Anything to avoid?", kind: "text", options: [], required: false };

describe("cleanOptions", () => {
    it("trims, drops blanks and repeats (ignoring case), keeping the first spelling", () => {
        expect(cleanOptions([" Sedan ", "", "SUV", "suv", "Truck", "  "])).toEqual(["Sedan", "SUV", "Truck"]);
    });
});

describe("parseQuestionsField", () => {
    it("reads the editor's questions", () => {
        const result = parseQuestionsField(JSON.stringify([{ prompt: "Make and model?", kind: "text", options: ["x"] }]));
        expect(result).toEqual({ ok: true, questions: [{ prompt: "Make and model?", kind: "text", options: [], required: true }] });
    });

    it("treats an empty field as no questions", () => {
        expect(parseQuestionsField("")).toEqual({ ok: true, questions: [] });
    });

    it("names the question with the problem", () => {
        expect(parseQuestionsField(JSON.stringify([{ prompt: "Fine?", kind: "text" }, { prompt: "", kind: "text" }]))).toEqual({
            ok: false,
            error: "Question 2: Write the question.",
        });
    });

    it("rejects malformed JSON and ids", () => {
        expect(parseQuestionsField("{nope").ok).toBe(false);
        expect(parseQuestionsField(JSON.stringify([{ id: "../x", prompt: "Hi?", kind: "text" }])).ok).toBe(false);
        expect(parseQuestionsField(JSON.stringify([{ prompt: "Hi?", kind: "scale" }])).ok).toBe(false);
    });
});

describe("answering", () => {
    it("lists the chosen services' questions in booking order", () => {
        const services = [
            { id: "s1", name: "Full detail", questions: [MODEL, KIND] },
            { id: "s2", name: "Pet hair", questions: [AVOID] },
            { id: "s3", name: "Wash", questions: [] },
        ];
        expect(questionsFor(services, ["s2", "s1"]).map((question) => `${question.serviceName}: ${question.prompt}`)).toEqual([
            "Pet hair: Anything to avoid?",
            "Full detail: Make and model?",
            "Full detail: What kind of car?",
        ]);
    });

    it("needs required answers, and choices from the list", () => {
        expect(answerErrors([MODEL, KIND, AVOID], {})).toEqual({ "q-model": "Please answer this.", "q-kind": "Pick one." });
        expect(answerErrors([KIND], { "q-kind": "Spaceship" })).toEqual({ "q-kind": "Pick one of the options." });
        expect(answerErrors([MODEL, KIND, AVOID], { "q-model": " Civic ", "q-kind": "SUV" })).toEqual({});
    });

    it("treats blank answers as unanswered", () => {
        expect(answerErrors([MODEL], { "q-model": "   " })).toEqual({ "q-model": "Please answer this." });
    });

    it("sends only non-blank, trimmed answers", () => {
        expect(answersToSend([MODEL, KIND, AVOID], { "q-model": " Civic ", "q-kind": "SUV", "q-avoid": " " })).toEqual([
            { questionId: "q-model", answer: "Civic" },
            { questionId: "q-kind", answer: "SUV" },
        ]);
    });
});
