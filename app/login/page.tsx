import { redirect } from "next/navigation";

// The front page used to live here; old links and bookmarks now land on the home page.
export default function LoginPage() {
  redirect("/");
}
