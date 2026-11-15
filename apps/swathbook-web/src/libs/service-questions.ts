/**
 * service-questions.ts
 *
 * Questions a business asks on a service ("Make and model?") and the
 * customer's answers. Shared by the owner's service editor, the public
 * booking flow and the customer app's API. The database checks the same rules
 * again (save_service_questions, create_booking); these give friendly messages
 * first.
 *
 * @module src/libs/service-questions
 * @since 1.0.0
 */

import { z } from "zod";

export type QuestionKind = "text" | "choice";

/** A question as the booking page shows it (get_booking_page). */
export type ServiceQuestion = {
    id: string;
    prompt: string;
    kind: QuestionKind;
    options: string[];
    required: boolean;
};

/** A saved answer, as owners and customers read it back. */
export type BookingAnswer = { service_name: string; prompt: string; answer: string };

export const MAX_QUESTIONS_PER_SERVICE = 10;
export const MAX_OPTIONS = 20;
export const MAX_ANSWER_LENGTH = 1000;

// --- Owner: editing a service's questions --------------------------------------

/** Trims, drops blanks, and removes repeats regardless of case (the first spelling wins). */
export function cleanOptions(options: string[]) {
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const raw of options) {
        const option = raw.trim();
        if (!option || seen.has(option.toLowerCase())) continue;
        seen.add(option.toLowerCase());
        clean.push(option);
    }
    return clean;
}

const questionDraft = z
    .object({
        /** Present for a saved question, so its past answers stay linked. */
        id: z.uuid().optional(),
        prompt: z.string().trim().min(2, { error: "Write the question." }).max(200, { error: "Keep questions under 200 characters." }),
        kind: z.enum(["text", "choice"]),
        options: z.array(z.string().max(80, { error: "Keep options under 80 characters." })).default([]).transform(cleanOptions),
        required: z.boolean().default(true),
    })
    .superRefine((question, context) => {
        if (question.kind === "choice" && (question.options.length < 2 || question.options.length > MAX_OPTIONS)) {
            context.addIssue({ code: "custom", path: ["options"], message: `Give at least two choices (up to ${MAX_OPTIONS}).` });
        }
    })
    .transform((question) => ({ ...question, options: question.kind === "choice" ? question.options : [] }));

export const serviceQuestionsSchema = z
    .array(questionDraft)
    .max(MAX_QUESTIONS_PER_SERVICE, { error: `Ask up to ${MAX_QUESTIONS_PER_SERVICE} questions per service.` });

export type QuestionDraft = z.input<typeof questionDraft>;

/**
 * Reads the editor's questions (a JSON field in the service form). Returns the
 * first problem as a message, so the editor can show it next to the questions.
 */
export function parseQuestionsField(value: string): { ok: true; questions: z.output<typeof serviceQuestionsSchema> } | { ok: false; error: string } {
    let json: unknown;
    try {
        json = value ? JSON.parse(value) : [];
    } catch {
        return { ok: false, error: "We couldn't read your questions. Please try again." };
    }
    const parsed = serviceQuestionsSchema.safeParse(json);
    if (parsed.success) return { ok: true, questions: parsed.data };
    const issue = parsed.error.issues[0];
    const index = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
    return { ok: false, error: index ? `Question ${index}: ${issue.message}` : issue.message };
}

// --- Customer: answering them while booking --------------------------------------

/** The answers sent with a booking; no default, so callers can tell "none sent" from "none given". */
export const bookingAnswersListSchema = z
    .array(
        z.object({
            questionId: z.uuid(),
            answer: z.string().trim().max(MAX_ANSWER_LENGTH, { error: `Keep answers under ${MAX_ANSWER_LENGTH} characters.` }),
        }),
    )
    .max(100);

export const bookingAnswersSchema = bookingAnswersListSchema.default([]);

export type BookingAnswerInput = { questionId: string; answer: string };

/** Every question on the chosen services, in booking order. */
export function questionsFor(services: Array<{ id: string; name: string; questions?: ServiceQuestion[] }>, chosenIds: string[]) {
    return chosenIds.flatMap((id) => {
        const service = services.find((candidate) => candidate.id === id);
        return (service?.questions ?? []).map((question) => ({ ...question, serviceName: service!.name }));
    });
}

/** Problems with the answers to `questions`, keyed by question id. Empty when they're all fine. */
export function answerErrors(questions: ServiceQuestion[], answers: Record<string, string>) {
    const errors: Record<string, string> = {};
    for (const question of questions) {
        const answer = (answers[question.id] ?? "").trim();
        if (!answer) {
            if (question.required) errors[question.id] = question.kind === "choice" ? "Pick one." : "Please answer this.";
        } else if (question.kind === "choice" && !question.options.includes(answer)) {
            errors[question.id] = "Pick one of the options.";
        } else if (answer.length > MAX_ANSWER_LENGTH) {
            errors[question.id] = `Keep it under ${MAX_ANSWER_LENGTH} characters.`;
        }
    }
    return errors;
}

/** The non-blank answers to send with a booking. */
export function answersToSend(questions: ServiceQuestion[], answers: Record<string, string>): BookingAnswerInput[] {
    return questions
        .map((question) => ({ questionId: question.id, answer: (answers[question.id] ?? "").trim() }))
        .filter((item) => item.answer !== "");
}
