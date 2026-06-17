"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCalendarEvent = exports.updateCalendarEvent = exports.createCalendarEvent = void 0;
const googleapis_1 = require("googleapis");
const google_1 = require("../config/google");
const admin_model_1 = __importDefault(require("../models/admin.model"));
const getCalendarClient = async (refreshToken) => {
    google_1.oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });
    await google_1.oauth2Client.getAccessToken();
    return googleapis_1.google.calendar({
        version: "v3",
        auth: google_1.oauth2Client,
    });
};
const createCalendarEvent = async (refreshToken, lead) => {
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
                    dateTime: new Date(new Date(lead.followUp.date).getTime() + 30 * 60000).toISOString(),
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
    }
    catch (err) {
        console.log("Google Calendar Error:", err?.message);
        if (err?.message?.includes("invalid_grant")) {
            await admin_model_1.default.updateMany({}, {
                $set: {
                    "googleCalendar.isConnected": false,
                },
            });
        }
        throw err;
    }
};
exports.createCalendarEvent = createCalendarEvent;
const updateCalendarEvent = async (refreshToken, eventId, lead) => {
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
    }
    catch (err) {
        console.log("UPDATE ERROR:", err);
        throw err;
    }
};
exports.updateCalendarEvent = updateCalendarEvent;
const deleteCalendarEvent = async (refreshToken, eventId) => {
    try {
        const calendar = await getCalendarClient(refreshToken);
        await calendar.events.delete({
            calendarId: "primary",
            eventId,
        });
        console.log("EVENT DELETED");
        return true;
    }
    catch (err) {
        console.log("DELETE ERROR:", err);
        throw err;
    }
};
exports.deleteCalendarEvent = deleteCalendarEvent;
//# sourceMappingURL=googleCalendar.service.js.map