import { z } from 'zod';

// Tarayıcıda şemalar yüklenmeden önce: CSP'yi gevşetmeden Zod'un Function yoklamasını önle.
z.config({ jitless: true });
