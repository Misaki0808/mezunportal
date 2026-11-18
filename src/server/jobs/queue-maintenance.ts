/** pg-boss silme bakımını sık çalıştırır; işlerin deleteAfterSeconds süresini değiştirmez. */
export const QUEUE_MAINTENANCE = {
  superviseIntervalSeconds: 5,
  maintenanceIntervalSeconds: 5,
} as const;
