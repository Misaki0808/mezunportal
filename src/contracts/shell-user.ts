/**
 * Uygulama kabuğunun yan menü alt kartı: oturumdaki kişinin KENDİ adı ve doğrulanmış etkin üyeliğinden gelen kısa satır
 * (bölüm kodu + sınıf/rol). Başkasının verisi taşımaz; e-posta ve telefon yoktur; fotoğraf yalnız yetkili uygulama rotasından gelir.
 */
export type ShellStanding = 'GRADE' | 'PREPARATORY' | 'ALUMNI' | 'ACADEMIC' | 'NONE';

export type ShellUser = {
  name: string;
  photoSrc?: string;
  /** Doğrulanmış etkin üyelik yoksa `null`: kartta yalnız ad görünür (veri olmayan satır uydurulmaz). */
  membership: { departmentCode: string; standing: ShellStanding; grade?: number } | null;
};
