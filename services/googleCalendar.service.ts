import { google } from "googleapis";
import { oauth2Client } from "../config/google";
import Admin from "../models/admin.model";

const getCalendarClient = async (refreshToken: string) => {
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  await oauth2Client.getAccessToken();

  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
};

// ✅ FIX — sirf us specific admin ka token clear/disconnect karo jiska refreshToken
// invalid nikla, na ki `updateMany({}, ...)` se sabhi admins ka. Saath hi
// refreshToken bhi clear kiya taaki controllers ka `if (admin?.googleCalendar?.refreshToken)`
// check false ho jaye aur dobara-dobara retry na ho, log spam na ho.
async function handleInvalidGrant(refreshToken: string) {
  try {
    await Admin.findOneAndUpdate(
      { "googleCalendar.refreshToken": refreshToken },
      {
        $set: { "googleCalendar.isConnected": false },
        $unset: { "googleCalendar.refreshToken": "" },
      }
    );
    console.log("Google Calendar: invalid/expired refresh token cleared for affected admin");
  } catch (cleanupErr) {
    console.error("Failed to clear invalid Google refresh token:", cleanupErr);
  }
}

function isInvalidGrantError(err: any): boolean {
  return (
    err?.message?.includes("invalid_grant") ||
    err?.response?.data?.error === "invalid_grant"
  );
}

export const createCalendarEvent = async (refreshToken: string, lead: any) => {
  try {
    const calendar = await getCalendarClient(refreshToken);

    const response = await calendar.events.insert({
      calendarId: "primary",

      requestBody: {
        summary: `Lead Follow-up • ${lead.fullName}`,

        description: `

Phone:
${lead.phone}

Email:
${lead.email}

Message:
${lead.followUp?.message}

`,

        start: {
          dateTime: new Date(lead.followUp.date).toISOString(),
          timeZone: "Asia/Kolkata",
        },

        end: {
          dateTime: new Date(
            new Date(lead.followUp.date).getTime() + 30 * 60000,
          ).toISOString(),
          timeZone: "Asia/Kolkata",
        },

        reminders: {
          useDefault: false,

          overrides: [
            {
              method: "email",
              minutes: 1440,
            },

            {
              method: "popup",
              minutes: 60,
            },
          ],
        },
      },
    });

    console.log("EVENT CREATED:", response.data);

    return response.data;
  } catch (err: any) {
    console.log("Google Calendar Error:", err?.message);

    if (isInvalidGrantError(err)) {
      await handleInvalidGrant(refreshToken);
    }

    throw err;
  }
};

export const updateCalendarEvent = async (
  refreshToken: string,
  eventId: string,
  lead: any,
) => {
  try {
    const calendar = await getCalendarClient(refreshToken);

    // ✅ FIX — pehle .split('T')[0] se sirf date (e.g. "2026-07-23") bhej rahe the,
    // jo `dateTime` field ke liye invalid hai (Google ko poora RFC3339 datetime
    // chahiye). Ab poora ISO datetime bhejte hain, aur start/end alag time
    // (30 min gap) rakhte hain — jaisa createCalendarEvent mein hai.
    const startDateTime = new Date(lead.followUp.date).toISOString();
    const endDateTime = new Date(
      new Date(lead.followUp.date).getTime() + 30 * 60000,
    ).toISOString();

    const response = await calendar.events.update({
      calendarId: "primary",
      eventId,

      requestBody: {
        summary: `Lead Follow-up • ${lead.fullName}`,

        description: `

Phone:
${lead.phone}

Email:
${lead.email}

Message:
${lead.followUp?.message}

`,

        start: {
          dateTime: startDateTime,
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: endDateTime,
          timeZone: "Asia/Kolkata",
        },
      },
    });

    console.log("EVENT UPDATED:", response.data);

    return response.data;
  } catch (err: any) {
    console.log("UPDATE ERROR:", err?.message ?? err);

    // ✅ FIX — invalid_grant handling yahan bhi add ki, pehle missing thi
    if (isInvalidGrantError(err)) {
      await handleInvalidGrant(refreshToken);
    }

    throw err;
  }
};

export const deleteCalendarEvent = async (
  refreshToken: string,
  eventId: string,
) => {
  try {
    const calendar = await getCalendarClient(refreshToken);

    await calendar.events.delete({
      calendarId: "primary",
      eventId,
    });

    console.log("EVENT DELETED");

    return true;
  } catch (err: any) {
    console.log("DELETE ERROR:", err?.message ?? err);

    // ✅ FIX — invalid_grant handling yahan bhi add ki, pehle missing thi
    if (isInvalidGrantError(err)) {
      await handleInvalidGrant(refreshToken);
    }

    throw err;
  }
};