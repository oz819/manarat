import type { Metadata } from "next";
import PlatformAbout from "@/components/center/PlatformAbout";

// What تلاوة is: features, how to start, the memorization map. Public (no session needed);
// sign-in is on /login.
export const metadata: Metadata = {
  title: "عن تلاوة · منصة إدارة مراكز تحفيظ القرآن الكريم",
  description: "منصّة مجانية لمراكز تحفيظ القرآن: الحلقات والطلاب والمعلّمون، متابعة الحفظ والحضور، وتقارير الأهل.",
};

export default function AboutPage() {
  return <PlatformAbout />;
}
