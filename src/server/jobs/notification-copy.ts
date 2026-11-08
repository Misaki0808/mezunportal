import 'server-only';
import messages from '../../../messages/tr.json';

type Key = keyof typeof messages.notifications.email;
/** Bu şablonlar yalnız basit isimli yer tutucular kullanır; metnin kaynağı mesaj kataloğudur. */
export function notificationCopy(key: Key, values: Record<string, string> = {}): string {
  return messages.notifications.email[key].replace(
    /\{([A-Za-z]+)\}/g,
    (_match, name: string) => values[name] ?? '',
  );
}
