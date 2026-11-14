import AppShell from "@/components/AppShell";
import { appFonts } from "@/lib/appFonts";

export default function Home() {
  return (
    <div className={`app-bg ${appFonts}`}>
      <AppShell />
    </div>
  );
}
