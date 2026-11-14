import AppShell from "@/components/AppShell";
import { appFonts } from "@/lib/appFonts";
import "../madaya.css";

export default function Home() {
  return (
    <div className={`app-bg ${appFonts}`}>
      <AppShell />
    </div>
  );
}
