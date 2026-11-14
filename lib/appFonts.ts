import { Amiri, Cairo, Tajawal } from "next/font/google";

// The fonts a user can pick in «المظهر» (IBM Plex Sans Arabic is already the app's own, --font-body).
// Self-hosted by next/font; not preloaded, so a font's files load only once someone picks it.
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "600", "700"], variable: "--font-cairo", display: "swap", preload: false });
const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], variable: "--font-tajawal", display: "swap", preload: false });
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri-ui", display: "swap", preload: false });

export const appFonts = `${cairo.variable} ${tajawal.variable} ${amiri.variable}`;
