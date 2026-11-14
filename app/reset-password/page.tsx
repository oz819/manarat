import { redirect } from "next/navigation";

// Sign-in is by an emailed code only, so there is no password to set; old links (and recovery
// emails sent before the change) land on the home page, where the login is.
export default function ResetPasswordPage() {
  redirect("/");
}
