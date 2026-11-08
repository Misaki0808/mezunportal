const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Istanbul',
});
const dateTimeFormat = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export const formatDate = (value: Date | string) => dateFormat.format(new Date(value));
export const formatDateTime = (value: Date | string) => dateTimeFormat.format(new Date(value));
