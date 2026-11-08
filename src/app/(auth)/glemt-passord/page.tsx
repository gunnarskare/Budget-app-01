import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Glemt passord" };

export default function ForgotPage() {
  return <ForgotForm />;
}
