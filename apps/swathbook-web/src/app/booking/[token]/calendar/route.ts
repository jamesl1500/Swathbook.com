import { loadCustomerBooking } from "@/libs/customer-booking";

function icsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** "Add to calendar": a single-event .ics file for the customer's booking. */
export async function GET(_request: Request, { params }: RouteContext<"/booking/[token]/calendar">) {
  const { token } = await params;
  const booking = await loadCustomerBooking(token);
  if (!booking?.businesses) return new Response("Not found", { status: 404 });

  const address = booking.customer_addresses;
  const location = address ? [address.line1, address.line2, address.city, address.region, address.postal_code].filter(Boolean).join(", ") : "";
  const services = booking.booking_items.map((item) => item.name).join(", ");

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Swathbook//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@swathbook.com`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(booking.scheduled_start)}`,
    `DTEND:${icsDate(booking.scheduled_end)}`,
    `SUMMARY:${escapeIcs(`${booking.businesses.name}: ${services}`)}`,
    location ? `LOCATION:${escapeIcs(location)}` : "",
    `DESCRIPTION:${escapeIcs(`Booking ${booking.reference}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${booking.reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
