import { Amiri, Cairo, Reem_Kufi, Tajawal } from "next/font/google";

// The fonts a user can pick in «المظهر» (IBM Plex Sans Arabic is already the app's own, --font-body).
// Self-hosted by next/font. Cairo is the default, so it is preloaded; the others load only once someone picks them.
const cairo = Cairo({ subsets: ["arabic", "latin"], weight: ["400", "600", "700"], variable: "--font-cairo", display: "swap" });
const tajawal = Tajawal({ subsets: ["arabic", "latin"], weight: ["400", "500", "700"], variable: "--font-tajawal", display: "swap", preload: false });
const amiri = Amiri({ subsets: ["arabic", "latin"], weight: ["400", "700"], variable: "--font-amiri-ui", display: "swap", preload: false });

// Reem Kufi: the headings inside the app, as in the Madaya centre.
const reemKufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap" });

export const appFonts = `${cairo.variable} ${tajawal.variable} ${amiri.variable} ${reemKufi.variable}`;
