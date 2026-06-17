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
          dateTime: lead.followUp.date,

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

    if (err?.message?.includes("invalid_grant")) {
      await Admin.updateMany(
        {},
        {
          $set: {
            "googleCalendar.isConnected": false,
          },
        },
      );
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
  dateTime: new Date(lead.followUp.date).toISOString().split('T')[0],
  timeZone: "Asia/Kolkata",
},
end: {
  dateTime: new Date(lead.followUp.date).toISOString().split('T')[0],
  timeZone: "Asia/Kolkata",
},
      },
    });

    console.log("EVENT UPDATED:", response.data);

    return response.data;
  } catch (err) {
    console.log("UPDATE ERROR:", err);

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
  } catch (err) {
    console.log("DELETE ERROR:", err);

    throw err;
  }
};
