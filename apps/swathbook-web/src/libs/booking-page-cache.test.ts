import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from "next/cache";
import { bookingPageChanged, bookingPageTag, bookingSlugTag } from "./booking-page-cache";

beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
    vi.mocked(revalidateTag).mockImplementation(() => undefined);
});

describe("bookingPageChanged", () => {
    it("expires the business's page at once, and any slugs it now owns", () => {
        bookingPageChanged("b1", { slugs: ["Green-Acres", null] });
        expect(revalidateTag).toHaveBeenCalledWith(bookingPageTag("b1"), { expire: 0 });
        expect(revalidateTag).toHaveBeenCalledWith(bookingSlugTag("green-acres"), { expire: 0 });
        expect(revalidateTag).toHaveBeenCalledTimes(2);
    });

    it("never fails the save or webhook that called it", () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.mocked(revalidateTag).mockImplementation(() => {
            throw new Error("outside a request");
        });
        // Throwing here would fail the test.
        bookingPageChanged("b1");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("couldn't expire booking-page:b1"), "outside a request");
        log.mockRestore();
    });
});
