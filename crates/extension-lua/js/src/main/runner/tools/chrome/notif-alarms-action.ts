import { z } from "zod";
import { registerTool } from "../../../../shared/tool-registry.js";
import {
  ChromeActionSetBadgeBackgroundColorParamsSchema,
  ChromeActionSetBadgeTextParamsSchema,
  ChromeActionSetIconParamsSchema,
  ChromeActionSetTitleParamsSchema,
  ChromeAlarmsClearParamsSchema,
  ChromeAlarmsCreateParamsSchema,
  NotificationsClearParamsSchema,
  NotificationsCreateParamsSchema,
} from "../../../../shared/schemas.js";
import {
  handleChromeActionSetBadgeBackgroundColor,
  handleChromeActionSetBadgeText,
  handleChromeActionSetIcon,
  handleChromeActionSetTitle,
  handleChromeAlarmsClear,
  handleChromeAlarmsCreate,
  handleChromeNotificationsClear,
  handleChromeNotificationsCreate,
} from "./handlers.js";


registerTool({
  action: "chrome_alarms_create",
  namespace: "chrome",
  name: "alarms.create",
  publicName: "chrome.alarms.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create an alarm",
  params: ChromeAlarmsCreateParamsSchema,
  paramTypes: [
    {
      name: "name",
      type: "string",
      required: false,
      description: "Alarm name",
    },
    {
      name: "alarmInfo",
      type: "object",
      required: false,
      description: "When: delayInMinutes, periodInMinutes",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { name: "Alarm name", alarmInfo: "Alarm info" },
  handler: handleChromeAlarmsCreate,
});

registerTool({
  action: "chrome_alarms_clear",
  namespace: "chrome",
  name: "alarms.clear",
  publicName: "chrome.alarms.clear",
  source: "main_thread",
  transport: "chrome_api",
  description: "Clear an alarm",
  params: ChromeAlarmsClearParamsSchema,
  paramTypes: [
    {
      name: "name",
      type: "string",
      required: false,
      description: "Alarm name (omit clears all)",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { name: "Alarm name" },
  handler: handleChromeAlarmsClear,
});

registerTool({
  action: "chrome_action_setBadgeText",
  namespace: "chrome",
  name: "action.setBadgeText",
  publicName: "chrome.action.setBadgeText",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the badge text on the extension action icon",
  params: ChromeActionSetBadgeTextParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "text, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Badge text details" },
  handler: handleChromeActionSetBadgeText,
});

registerTool({
  action: "chrome_action_setBadgeBackgroundColor",
  namespace: "chrome",
  name: "action.setBadgeBackgroundColor",
  publicName: "chrome.action.setBadgeBackgroundColor",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the badge background color",
  params: ChromeActionSetBadgeBackgroundColorParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "color, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Color details" },
  handler: handleChromeActionSetBadgeBackgroundColor,
});

registerTool({
  action: "chrome_action_setTitle",
  namespace: "chrome",
  name: "action.setTitle",
  publicName: "chrome.action.setTitle",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the title of the extension action",
  params: ChromeActionSetTitleParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "title, tabId",
    },
  ],
  returns: z.null(),
  returnDoc: "null",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Title details" },
  handler: handleChromeActionSetTitle,
});

registerTool({
  action: "chrome_action_setIcon",
  namespace: "chrome",
  name: "action.setIcon",
  publicName: "chrome.action.setIcon",
  source: "main_thread",
  transport: "chrome_api",
  description: "Set the icon of the extension action",
  params: ChromeActionSetIconParamsSchema,
  paramTypes: [
    {
      name: "details",
      type: "object",
      required: true,
      description: "imageData, path, tabId",
    },
  ],
  returns: z.unknown(),
  returnDoc: "any",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { details: "Icon details" },
  handler: handleChromeActionSetIcon,
});

registerTool({
  action: "chrome_notifications_create",
  namespace: "chrome",
  name: "notifications.create",
  publicName: "chrome.notifications.create",
  source: "main_thread",
  transport: "chrome_api",
  description: "Create a notification",
  params: NotificationsCreateParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Notification ID",
    },
    {
      name: "options",
      type: "object",
      required: false,
      description: "Notification options: type, title, message, iconUrl",
    },
  ],
  returns: z.string(),
  returnDoc: "string",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Notification ID", options: "Notification options" },
  handler: handleChromeNotificationsCreate,
});

registerTool({
  action: "chrome_notifications_clear",
  namespace: "chrome",
  name: "notifications.clear",
  publicName: "chrome.notifications.clear",
  source: "main_thread",
  transport: "chrome_api",
  description: "Clear a notification",
  params: NotificationsClearParamsSchema,
  paramTypes: [
    {
      name: "id",
      type: "string",
      required: false,
      description: "Notification ID to clear",
    },
  ],
  returns: z.boolean(),
  returnDoc: "boolean",
  errorCode: "ECHROME",
  errorCategory: "extension",
  paramDocs: { id: "Notification ID" },
  handler: handleChromeNotificationsClear,
});