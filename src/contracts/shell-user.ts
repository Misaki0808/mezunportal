/**
 * Uygulama kabuğunun yan menü alt kartı: oturumdaki kişinin KENDİ adı ve doğrulanmış etkin üyeliğinden gelen kısa satır
 * (bölüm kodu + sınıf/rol). Başkasının verisi taşımaz; e-posta, telefon ve görsel adresi yoktur.
 */
export type ShellStanding = 'GRADE' | 'PREPARATORY' | 'ALUMNI' | 'ACADEMIC' | 'NONE';

export type ShellUser = {
  name: string;
  /** Doğrulanmış etkin üyelik yoksa `null`: kartta yalnız ad görünür (veri olmayan satır uydurulmaz). */
  membership: { departmentCode: string; standing: ShellStanding; grade?: number } | null;
};
