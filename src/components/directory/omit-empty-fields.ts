/**
 * GET formunda boş alanlar adrese girmesin (`/ilanlar?q=ornek&departmentId=&kind=&location=…` yerine `/ilanlar?q=ornek`):
 * paylaşılan adres kısa ve okunur kalır. Tarayıcı gönderim verisini `submit`ten SONRA toplar ve `formdata` olayında
 * değiştirmeye izin verir; boş metin değerleri oradan atılır. Dolu alanlara, dosya alanlarına ve alanların sırasına
 * dokunulmaz. `ref` olarak verilir (React 19: dönen işlev temizliktir). Olay desteklenmiyorsa ya da JavaScript yoksa form
 * eskisi gibi çalışır: boş parametreler de gider ve sunucu yine doğru okur.
 */
export function omitEmptyFields(form: HTMLFormElement | null): (() => void) | undefined {
  if (!form) return undefined;
  const onFormData = (event: FormDataEvent) => {
    const data = event.formData;
    const kept = [...data.entries()].filter(
      ([, value]) => typeof value !== 'string' || value !== '',
    );
    if (kept.length === [...data.keys()].length) return;
    for (const name of new Set([...data.keys()])) data.delete(name);
    for (const [name, value] of kept) data.append(name, value);
  };
  form.addEventListener('formdata', onFormData);
  return () => form.removeEventListener('formdata', onFormData);
}
