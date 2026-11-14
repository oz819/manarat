import { redirect } from "next/navigation";

// Sign-in is by an emailed code only, so there is no password to recover; old links land on the
// home page, where the login is.
export default function ForgotPasswordPage() {
  redirect("/");
}
