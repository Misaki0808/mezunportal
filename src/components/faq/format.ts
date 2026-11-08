const dateFormat = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeZone: 'Europe/Istanbul',
});
export const formatDate = (value: Date | string) => dateFormat.format(new Date(value));
