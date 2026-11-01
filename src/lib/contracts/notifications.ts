import { z } from "zod";
import { Role } from "./enums";

export const NotificationCategory = z.enum([
  "booking",
  "timetable",
  "change",
  "spectra",
  "exam",
  "alert",
]);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

export const NotificationType = z.enum(["info", "success", "warning", "error"]);
export type NotificationType = z.infer<typeof NotificationType>;

export const AppNotificationSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  category: NotificationCategory,
  type: NotificationType,
  timestamp: z.string(),
  read: z.boolean(),
  href: z.string().optional(),
  badge: z.string().optional(),
  roles: z.array(Role).optional(),
});
export type AppNotification = z.infer<typeof AppNotificationSchema>;

export const NotificationsResponseSchema = z.array(AppNotificationSchema);
export type NotificationsResponse = z.infer<typeof NotificationsResponseSchema>;

